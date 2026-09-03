import type { Core } from '@strapi/strapi';
import { AUDIENCE_PEAK_PROVIDERS, LEMONCAMS_SLUGS, PROVIDER_IDS } from './providers';
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
/**
 * Candidates: seen recently (page gets traffic) and not the single-sighting noise tail.
 *
 * MIN_PEAK is a POPULARITY PROXY, so it only means anything where peakViewers is a real
 * audience count. A provider that publishes something else entirely (ImLive counts guests in
 * its free room: 0-7) would be filtered out wholesale — measured, 254 of its 256 recent rows
 * sat under this threshold, so its heatmaps would have stayed permanently empty. Those
 * providers qualify on recency alone; their rosters are small (hundreds, not tens of
 * thousands), so the politeness budget is unaffected.
 */
const RECENT_DAYS = 14;
const MIN_PEAK = 10;
/**
 * Rows per tick for providers MIN_PEAK cannot filter (see above). They get their own small pass
 * AHEAD of the main scan, because the main scan is ordered by peak viewers — measured, ImLive's
 * best row would have waited behind ~59_000 higher-peak fetches, i.e. days of ticks, before
 * anyone saw an ImLive heatmap. Their rosters are hundreds of rows, so a slice this size covers
 * one in a handful of ticks and then costs nothing (every row skips as already-rich).
 */
const PRIORITY_BATCH = 60;

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
  /**
   * The priority pass's own id cursor, which WRAPS to 0 at the end of the roster instead of
   * finishing: peak viewers can't order these rows and nothing else marks progress, so a wrap
   * is how a row that was offline last time gets a second chance. priorityWork counts fetches
   * needed since the last wrap — a wrap with zero of them means every one of these rows is
   * covered, and only then may the tick declare the whole backfill done.
   */
  priorityIdCursor: number;
  priorityWork: number;
  priorityDone: boolean;
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

type CandidateRow = {
  id: number;
  key: string;
  provider: string;
  username: string;
  activity: unknown;
  peak_viewers: number;
};

const SELECT_COLUMNS = ['id', 'key', 'provider', 'username', 'activity', 'peak_viewers'];

/**
 * One row's import, shared by both passes so they can never drift apart in what they do to a
 * row — only in which rows they choose. Reports what happened; the caller owns the cursors,
 * the counters and the failure budget.
 */
async function importRow(
  row: CandidateRow,
  ctx: { nowMin: number; save: (id: number, pairs: SessionPair[]) => Promise<void> },
): Promise<'skipped' | 'imported' | 'empty' | 'failed'> {
  const slug = PROVIDER_SLUGS[row.provider];
  if (!slug) return 'skipped';
  const ours = normalizeActivity(row.activity);
  if (ours.length >= MIN_EXISTING_PAIRS) return 'skipped';
  try {
    const res = await fetch(
      `${API}?provider=${slug}&username=${encodeURIComponent(row.username)}&function=cam-log-load`,
      { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return 'failed';
    const theirs = slotsToPairs(((await res.json()) as { days?: unknown }).days);
    if (theirs.length === 0) return 'empty';
    await ctx.save(row.id, mergePairs(theirs, ours, ctx.nowMin));
    return 'imported';
  } catch {
    return 'failed';
  }
}

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
    priorityIdCursor: 0,
    priorityWork: 0,
    priorityDone: false,
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
  const seenRecently = isSqlite ? recentCutoff : new Date(recentCutoff).toISOString();
  const nowMin = Math.floor(Date.now() / 60000);
  const ctx = {
    nowMin,
    save: async (id: number, pairs: SessionPair[]) => {
      // activity only — updated_at must stay put (the sync's full-refresh throttle reads it).
      await knex(meta.tableName).where('id', id).update({ activity: JSON.stringify(pairs) });
    },
  };
  let failures = 0;

  // ── Priority pass: providers MIN_PEAK can't rank, cleared ahead of the main scan ──────
  // Gated on its own done flag: once a full lap needed no fetches, every further lap would
  // re-ask lemoncams about the same empty/sparse rows for as long as the main scan still runs
  // (days, at its size) — pure waste. Models created after the flag flips accrue organically,
  // exactly like main-pass rows behind the cursor.
  const priorityProviders = PROVIDER_IDS.filter((id) => !AUDIENCE_PEAK_PROVIDERS.includes(id));
  if (priorityProviders.length === 0) {
    state.priorityDone = true;
  } else if (!state.priorityDone) {
    const priorityRows: CandidateRow[] = await knex(meta.tableName)
      .select(SELECT_COLUMNS)
      .whereIn('provider', priorityProviders)
      .andWhere('last_seen_at', '>', seenRecently)
      .andWhere('id', '>', state.priorityIdCursor)
      .orderBy('id', 'asc')
      .limit(PRIORITY_BATCH);

    for (const row of priorityRows) {
      state.priorityIdCursor = row.id;
      state.scanned += 1;
      const outcome = await importRow(row, ctx);
      if (outcome === 'skipped') continue;
      // 'empty' counts as COVERED, not as outstanding work: we asked and lemoncams has no
      // history for this model. Counting it as work would keep priorityDone false forever and
      // the one-shot cron would never retire, re-asking the same empty rooms every 10 minutes.
      // Only a transient failure (or a fresh import) means there is still something to do.
      if (outcome !== 'empty') state.priorityWork += 1;
      if (outcome === 'imported') state.imported += 1;
      if (outcome === 'failed') failures += 1;
      if (failures >= MAX_FAILURES) break;
      await sleep(DELAY_MS);
    }

    // End of the roster: wrap. A full lap that needed no fetches means every one of these rows
    // is covered — the only condition under which the tick below may retire the whole backfill.
    if (priorityRows.length < PRIORITY_BATCH) {
      state.priorityDone = state.priorityWork === 0;
      state.priorityIdCursor = 0;
      state.priorityWork = 0;
    }
  }

  // ── Main pass: audience-ranked providers, most-viewed first ───────────────────────────
  const rows: CandidateRow[] = await knex(meta.tableName)
    .select(SELECT_COLUMNS)
    .modify((q) => {
      if (state.peakCursor !== null) {
        const peak = state.peakCursor;
        const id = state.idCursor;
        q.where((b) =>
          b.where('peak_viewers', '<', peak).orWhere((eq) => eq.where('peak_viewers', '=', peak).andWhere('id', '>', id)),
        );
      }
    })
    .andWhere('last_seen_at', '>', seenRecently)
    // MIN_PEAK filters only the providers it can speak for; the rest were handled above.
    .whereIn('provider', AUDIENCE_PEAK_PROVIDERS)
    .andWhere('peak_viewers', '>=', MIN_PEAK)
    .orderBy([
      { column: 'peak_viewers', order: 'desc' },
      { column: 'id', order: 'asc' },
    ])
    .limit(BATCH);

  if (rows.length === 0 && state.priorityDone) {
    await store.set({ key: STORE_KEY, value: { ...state, done: true } });
    strapi.log.info(
      `[cam-backfill] complete: ${state.imported} imported / ${state.scanned} scanned / ${state.failed} failed`,
    );
    return;
  }

  for (const row of rows) {
    if (failures >= MAX_FAILURES) break; // they're down or throttling — resume next tick
    // Advances even past failures — a row is attempted at most once per pass.
    state.peakCursor = row.peak_viewers;
    state.idCursor = row.id;
    state.scanned += 1;
    const outcome = await importRow(row, ctx);
    if (outcome === 'skipped') continue;
    if (outcome === 'imported') state.imported += 1;
    if (outcome === 'failed') failures += 1;
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
