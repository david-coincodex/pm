import type { Core } from '@strapi/strapi';
import { LEMONCAMS_SLUGS } from './providers';
import { CAM_MODEL_UID as UID, ACTIVITY_WINDOW_DAYS, ACTIVITY_MAX_SESSIONS } from './constants';
import { normalizeActivity, type SessionPair } from './session-history';

/**
 * One-shot backfill of `activity` histories from lemoncams' public cam-log API, so the
 * usual-online-hours heatmaps have up to 28 days of data right after this feature deploys
 * instead of accruing from zero. Runs as a cron tick (see config/server.ts): each tick pages
 * BATCH rows forward (highest peak viewers first — see BackfillState), imports what lemoncams
 * has, and persists its cursor in the core
 * store — when the cursor runs off the end of the candidates it marks itself done FOREVER
 * and every later tick is a no-op read. Idempotent by construction (set-union merge), so
 * re-running against already-backfilled rows changes nothing.
 *
 * Their format (verified UTC against our own feed-reported session starts): per day → per
 * hour → observed 10-minute slots. Ours: [startMin, endMin] epoch-minute pairs. Consecutive
 * slots collapse into pairs; a single missed poll is bridged, larger gaps split.
 *
 * Politeness towards the third party: BATCH × ~3 req/s per tick, a failure circuit breaker,
 * and candidates limited to models that matter (recently seen, non-trivial peak viewers).
 */

const API = 'https://api-v2-prod.lemoncams.com/main';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
/** From the provider kernel (providers.json). */
const PROVIDER_SLUGS = LEMONCAMS_SLUGS;

/** VERSIONED: bump when a provider is added, so the one-shot scan runs once more per
 * environment and imports the newcomer's history. Merges are idempotent and pair-rich rows are
 * skipped, so the re-scan is mostly cursor movement. */
const STORE_KEY = 'activityBackfill-v2';
/** Rows advanced per tick; at DELAY_MS spacing a tick stays well inside its cron window. */
const BATCH = 250;
const DELAY_MS = 300;
/** Fetch failures per tick before backing off to the next tick (site down / throttling us). */
const MAX_FAILURES = 20;
/** Rows that already carry this many pairs are organically rich — skip the request. */
const MIN_EXISTING_PAIRS = 6;
/** Candidates: seen recently (page gets traffic) and not the single-sighting noise tail. */
const RECENT_DAYS = 14;
const MIN_PEAK = 10;

const SLOT_MIN = 10; // lemoncams' poll granularity
const BRIDGE_MIN = 20; // one missed poll is bridged; anything larger splits the session

/**
 * Composite (peakViewers DESC, id ASC) cursor: the most-viewed models are the pages with
 * traffic, so they get their heatmaps FIRST — an id-only cursor on a large registry left the
 * top models unbackfilled for a day while it chewed through the noise tail. peakCursor null =
 * not started. Rows whose peak moves across the cursor mid-backfill are either re-visited
 * (harmless — merge is idempotent, rich rows are skipped) or missed (rare; the sync covers
 * them organically).
 */
type BackfillState = {
  peakCursor: number | null;
  idCursor: number;
  done: boolean;
  scanned: number;
  imported: number;
  failed: number;
};

/** Their day/hour/slot tree → sorted disjoint [startMin, endMin] pairs (their data is UTC). */
export function slotsToPairs(days: unknown): SessionPair[] {
  const slotStarts: number[] = [];
  if (Array.isArray(days)) {
    for (const day of days) {
      if (!day || typeof day !== 'object') continue;
      for (const [date, hours] of Object.entries(day as Record<string, unknown>)) {
        const dayMs = Date.parse(`${date}T00:00:00Z`);
        if (!Number.isFinite(dayMs) || !Array.isArray(hours)) continue;
        for (const hourEntry of hours) {
          if (!hourEntry || typeof hourEntry !== 'object') continue;
          for (const [hour, slots] of Object.entries(hourEntry as Record<string, unknown>)) {
            if (!Array.isArray(slots)) continue;
            for (const slot of slots) {
              slotStarts.push(dayMs / 60000 + Number(hour) * 60 + Number(slot));
            }
          }
        }
      }
    }
  }
  slotStarts.sort((a, b) => a - b);
  const pairs: SessionPair[] = [];
  for (const start of slotStarts) {
    if (!Number.isFinite(start)) continue;
    const last = pairs[pairs.length - 1];
    if (last && start - (last[1] - SLOT_MIN) <= BRIDGE_MIN) last[1] = start + SLOT_MIN;
    else pairs.push([start, start + SLOT_MIN]);
  }
  return pairs;
}

/** Set-union of both histories: sort, merge overlaps, trim the window, cap — idempotent. */
export function mergePairs(theirs: SessionPair[], ours: SessionPair[], nowMin: number): SessionPair[] {
  const all = [...theirs, ...ours].sort((a, b) => a[0] - b[0]);
  const out: SessionPair[] = [];
  for (const [s, e] of all) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  const cutoff = nowMin - ACTIVITY_WINDOW_DAYS * 24 * 60;
  return out.filter(([, e]) => e >= cutoff).slice(-ACTIVITY_MAX_SESSIONS);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runBackfillTick(strapi: Core.Strapi): Promise<void> {
  const store = strapi.store({ type: 'plugin', name: 'cam-model' });
  const stored = (await store.get({ key: STORE_KEY })) as Partial<BackfillState> | null;
  const state: BackfillState = {
    peakCursor: null,
    idCursor: 0,
    done: false,
    scanned: 0,
    imported: 0,
    failed: 0,
    // A pre-priority-cursor state (the retired id-only `cursor` field) restarts from the top:
    // idempotent merges + the rich-row skip make a re-scan cheap, losing progress does not.
    ...(stored && 'peakCursor' in stored ? stored : {}),
  };
  if (state.done) return;

  const meta = strapi.db.metadata.get(UID);
  const knex = strapi.db.connection;
  // Same dialect split as the sync's bulk touch: sqlite keeps datetimes as epoch-ms numbers.
  const isSqlite = String(strapi.db.config.connection.client ?? '').includes('sqlite');
  const recentCutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;

  const rows: {
    id: number;
    key: string;
    provider: string;
    username: string;
    activity: unknown;
    peak_viewers: number;
  }[] = await knex(meta.tableName)
    .select('id', 'key', 'provider', 'username', 'activity', 'peak_viewers')
    .modify((q) => {
      if (state.peakCursor !== null) {
        const peak = state.peakCursor;
        const id = state.idCursor;
        q.where((b) =>
          b.where('peak_viewers', '<', peak).orWhere((eq) => eq.where('peak_viewers', '=', peak).andWhere('id', '>', id)),
        );
      }
    })
    .andWhere('last_seen_at', '>', isSqlite ? recentCutoff : new Date(recentCutoff).toISOString())
    .andWhere('peak_viewers', '>=', MIN_PEAK)
    .orderBy([
      { column: 'peak_viewers', order: 'desc' },
      { column: 'id', order: 'asc' },
    ])
    .limit(BATCH);

  if (rows.length === 0) {
    await store.set({ key: STORE_KEY, value: { ...state, done: true } });
    strapi.log.info(
      `[cam-backfill] complete: ${state.imported} imported / ${state.scanned} scanned / ${state.failed} failed`,
    );
    return;
  }

  const nowMin = Math.floor(Date.now() / 60000);
  let failures = 0;

  for (const row of rows) {
    // Advances even past failures — a row is attempted at most once per pass.
    state.peakCursor = row.peak_viewers;
    state.idCursor = row.id;
    state.scanned += 1;
    const slug = PROVIDER_SLUGS[row.provider];
    if (!slug) continue;
    const ours = normalizeActivity(row.activity);
    if (ours.length >= MIN_EXISTING_PAIRS) continue;
    try {
      const res = await fetch(
        `${API}?provider=${slug}&username=${encodeURIComponent(row.username)}&function=cam-log-load`,
        { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) },
      );
      if (!res.ok) {
        failures += 1;
      } else {
        const theirs = slotsToPairs(((await res.json()) as { days?: unknown }).days);
        if (theirs.length > 0) {
          const merged = mergePairs(theirs, ours, nowMin);
          // activity only — updated_at must stay put (the sync's full-refresh throttle reads it).
          await knex(meta.tableName).where('id', row.id).update({ activity: JSON.stringify(merged) });
          state.imported += 1;
        }
      }
    } catch {
      failures += 1;
    }
    if (failures >= MAX_FAILURES) break; // they're down or throttling — resume next tick
    await sleep(DELAY_MS);
  }

  state.failed += failures;
  await store.set({ key: STORE_KEY, value: state });
  strapi.log.info(
    `[cam-backfill] tick: cursor peak=${state.peakCursor} id=${state.idCursor}, ${state.imported} imported / ${state.scanned} scanned${
      failures ? `, ${failures} failures this tick` : ''
    }`,
  );
}
