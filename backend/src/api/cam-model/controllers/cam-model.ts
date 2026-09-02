import { factories } from '@strapi/strapi';
import { createHash } from 'node:crypto';
import { CAM_MODEL_UID as UID, ROW_REFRESH_SLACK_MS, SESSION_TOLERANCE_MS } from '../constants';
import { reviseActivity } from '../session-history';
import { pingHeartbeat } from '../../../cron/heartbeat';

/** Batch size for $in lookups — a politeness bound, not a driver limit (modern better-sqlite3
 * binds up to 32,766 variables; Postgres far more). */
const KEY_CHUNK = 500;
/** Sanity ceiling on the posted roster. Feeds deliver ~3-6k live models; reject only clearly
 * broken payloads — a too-low ceiling would 400 every sync FOREVER and silently freeze the
 * registry the day the feeds grow. */
const MAX_ROSTER = 20_000;
/** Hard cap per keys() page — the sitemap's chunk size; anything above just wastes memory. */
const KEYS_PAGE_LIMIT = 20_000;

const PROVIDERS = new Set(['cb', 'bc']);
const GENDERS = new Set(['f', 'm', 'c', 't']);

interface IncomingModel {
  key: string;
  provider: 'cb' | 'bc';
  username: string;
  displayName: string;
  gender: string | null;
  country: string | null;
  languages: string[];
  tags: string[];
  viewers: number;
  profileImageUrl: string | null;
  thumbUrl: string | null;
  onlineSince: string | null;
}

/** Constant-time secret comparison without leaking length; unset env always fails. */
function secretMatches(header: unknown): boolean {
  const expected = process.env.CAM_SYNC_SECRET;
  if (!expected || typeof header !== 'string') return false;
  const a = createHash('sha256').update(header).digest();
  const b = createHash('sha256').update(expected).digest();
  return a.equals(b);
}

function sanitize(raw: unknown): IncomingModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const provider = String(m.provider ?? '');
  const username = String(m.username ?? '').slice(0, 60);
  // Same charset the frontend's cleanCamUsername allows; anything else would also end up
  // interpolated into thumb URLs by the capture cron.
  if (!PROVIDERS.has(provider) || !/^[\w.-]+$/.test(username)) return null;
  const gender = String(m.gender ?? '');
  const list = (v: unknown) =>
    Array.isArray(v) ? v.slice(0, 20).map((x) => String(x).slice(0, 50)) : [];
  return {
    key: `${provider}:${username}`,
    provider: provider as 'cb' | 'bc',
    username,
    displayName: (String(m.displayName ?? '').slice(0, 100) || username),
    gender: GENDERS.has(gender) ? gender : null,
    country: m.country ? String(m.country).slice(0, 8).toLowerCase() : null,
    languages: list(m.languages),
    tags: list(m.tags),
    viewers: Math.max(0, Math.floor(Number(m.viewers) || 0)),
    profileImageUrl: m.profileImageUrl ? String(m.profileImageUrl).slice(0, 500) : null,
    thumbUrl: m.thumbUrl ? String(m.thumbUrl).slice(0, 500) : null,
    onlineSince: cleanOnlineSince(m.onlineSince),
  };
}

/**
 * The feeds derive onlineSince from seconds_online, so clock skew can produce the future —
 * clamp that to now. Deliberately NO floor for ancient values: a floor would be a MOVING
 * clamp (now - horizon advances every sync while the stored wentOnlineAt stays put), which
 * made sessionChanged fire perpetually for marathon/garbage-counter rooms. Ancient values
 * are stored as-is — they are STABLE across polls, so the tolerance comparison works — and
 * reviseActivity owns the 7-day cap for what enters the activity history.
 * Unparsable/missing is null (some BongaCams rows simply lack online_time).
 */
function cleanOnlineSince(value: unknown): string | null {
  const ms = Date.parse(String(value ?? ''));
  if (!Number.isFinite(ms)) return null;
  return new Date(Math.min(ms, Date.now())).toISOString();
}

interface ExistingRow {
  id: number;
  key: string;
  lastSeenAt: string | Date | null;
  wentOnlineAt: string | Date | null;
  updatedAt: string | Date | null;
  peakViewers: number | null;
  displayName: string | null;
  gender: string | null;
  country: string | null;
  profileImageUrl: string | null;
}

export default factories.createCoreController(UID, ({ strapi }) => ({
  /**
   * Feed-roster upsert, called by the frontend every ~5 minutes with every model currently
   * live. Deliberately strapi.db.query, NOT strapi.documents(): the documents service has no
   * bulk operations, each write would run the normalizeMediaUrls middleware walk, and each
   * would emit webhooks — hundreds of revalidate calls per sync. Raw db writes need
   * publishedAt set explicitly (the db layer never sets it; documentId and timestamps are
   * automatic).
   *
   * Two write tiers, split by cost:
   *  - lastSeenAt is BULK-TOUCHED for the whole online roster every sync (a few chunked raw
   *    UPDATEs — the value is uniform, so per-row writes buy nothing). It is therefore exact
   *    to the sync cadence: the sitemap's lastmod and the "last online" hint depend on that.
   *  - Everything else (identity, tags, peak, wentOnlineAt, activity) keeps the throttled
   *    per-row write, now gated on updatedAt (which the bulk touch deliberately skips).
   */
  async sync(ctx) {
    if (!secretMatches(ctx.request.headers['x-cam-sync-secret'])) return ctx.unauthorized();

    const body = ctx.request.body as { models?: unknown[]; degradedProviders?: unknown } | undefined;
    if (!Array.isArray(body?.models)) return ctx.badRequest('models array is required');
    if (body.models.length > MAX_ROSTER) return ctx.badRequest('roster too large');
    // Which provider feeds failed on the frontend's last refresh (the snapshot then RETAINS
    // the previous roster — see registry.ts). Without this signal a total feed outage keeps
    // syncing stale rosters and the heartbeat would stay green through the incident.
    const degraded = Array.isArray(body.degradedProviders)
      ? body.degradedProviders.filter((p): p is string => typeof p === 'string').slice(0, 8)
      : [];

    // Sanitize + dedupe by key (feeds occasionally repeat a model across pages).
    const roster = new Map<string, IncomingModel>();
    for (const raw of body.models) {
      const m = sanitize(raw);
      if (m) roster.set(m.key, m);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const q = strapi.db.query(UID);
    const keys = [...roster.keys()];

    const existing = new Map<string, ExistingRow>();
    for (let i = 0; i < keys.length; i += KEY_CHUNK) {
      const rows: ExistingRow[] = await q.findMany({
        where: { key: { $in: keys.slice(i, i + KEY_CHUNK) } },
        // Scalars only — activity blobs are fetched later for just the rows being written:
        // the always-online rows (the whole roster here) accumulate the largest histories.
        select: ['id', 'key', 'lastSeenAt', 'wentOnlineAt', 'updatedAt', 'peakViewers', 'displayName', 'gender', 'country', 'profileImageUrl'],
      });
      for (const row of rows) existing.set(row.key, row);
    }

    let created = 0;
    let updated = 0;
    const pending: { row: ExistingRow; m: IncomingModel; sessionChanged: boolean }[] = [];
    for (const m of roster.values()) {
      const row = existing.get(m.key);
      if (!row) {
        try {
          await q.create({
            data: {
              key: m.key,
              provider: m.provider,
              username: m.username,
              displayName: m.displayName,
              gender: m.gender,
              country: m.country,
              languages: m.languages,
              tags: m.tags,
              firstSeenAt: nowIso,
              lastSeenAt: nowIso,
              // First sighting is almost always mid-session — a model found 3h into her
              // stream seeds wentOnlineAt and a 3h activity pair right away.
              wentOnlineAt: m.onlineSince,
              activity: reviseActivity({
                stored: null,
                sessionChanged: true,
                sessionStartMs: m.onlineSince ? Date.parse(m.onlineSince) : null,
                lastSeenMs: null,
                nowMs: now.getTime(),
              }),
              peakViewers: m.viewers,
              profileImageUrl: m.profileImageUrl,
              thumbUrl: m.thumbUrl,
              publishedAt: nowIso,
            },
          });
          created += 1;
        } catch (err) {
          // Unique-key loss against an overlapping sync (retry, second replica, a first run
          // longer than the cadence) — the other writer won; next sync updates the row.
          strapi.log.warn(`[cam-model] create raced for ${m.key}: ${String(err)}`);
        }
        continue;
      }

      // Gated on updatedAt, not lastSeenAt: the bulk touch below keeps lastSeenAt perpetually
      // fresh, so it can no longer measure how long ago the FULL row was refreshed. CAVEAT:
      // other writers bump updatedAt too (the photo crons stamp photosCapturedAt /
      // profileImageIngestedUrl), each deferring the next full refresh by up to an hour —
      // bounded and acceptable. The lastSeenAt clause is the safety net for the compounding
      // case: if the bulk touch ever breaks, lastSeenAt goes stale and forces a full write
      // (which sets it), preserving ONLINE_WINDOW_MS's guarantee for the capture cron.
      const updatedMs = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
      const lastSeenMs = row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0;
      const stale =
        now.getTime() - updatedMs > ROW_REFRESH_SLACK_MS ||
        now.getTime() - lastSeenMs > ROW_REFRESH_SLACK_MS;
      const peakBeaten = m.viewers > (row.peakViewers ?? 0);
      const identityChanged =
        m.displayName !== row.displayName ||
        m.gender !== (row.gender ?? null) ||
        m.country !== (row.country ?? null) ||
        m.profileImageUrl !== (row.profileImageUrl ?? null);
      // A genuinely new session (reconnect after a gap shorter than the slack) must write even
      // when nothing else changed, or wentOnlineAt/activity would miss it. Tolerance absorbs
      // the seconds-per-poll drift of feed-derived onlineSince. NOTE: on the first sync after
      // this column ships, every online row fires this once (wentOnlineAt is null) — a
      // one-time burst of ~roster-size writes that self-quiesces.
      const wentOnlineMs = row.wentOnlineAt ? new Date(row.wentOnlineAt).getTime() : null;
      const sessionChanged =
        m.onlineSince !== null &&
        (wentOnlineMs === null || Math.abs(Date.parse(m.onlineSince) - wentOnlineMs) > SESSION_TOLERANCE_MS);
      if (!stale && !peakBeaten && !identityChanged && !sessionChanged) continue;
      pending.push({ row, m, sessionChanged });
    }

    // Activity histories only for the rows actually being written (~hundreds, not the roster).
    const activityById = new Map<number, unknown>();
    for (let i = 0; i < pending.length; i += KEY_CHUNK) {
      const rows: { id: number; activity: unknown }[] = await q.findMany({
        where: { id: { $in: pending.slice(i, i + KEY_CHUNK).map((p) => p.row.id) } },
        select: ['id', 'activity'],
      });
      for (const r of rows) activityById.set(r.id, r.activity);
    }

    // Small concurrent batches: the steady state is a few hundred writes, but the one-time
    // post-deploy burst is the whole roster — sequential awaits would hold this request open
    // for tens of seconds against the frontend's 30s fire-and-forget timeout.
    const WRITE_BATCH = 20;
    for (let i = 0; i < pending.length; i += WRITE_BATCH) {
      await Promise.all(
        pending.slice(i, i + WRITE_BATCH).map(({ row, m, sessionChanged }) =>
          q.update({
            where: { id: row.id },
            data: {
              displayName: m.displayName,
              gender: m.gender,
              country: m.country,
              languages: m.languages,
              tags: m.tags,
              lastSeenAt: nowIso,
              ...(sessionChanged ? { wentOnlineAt: m.onlineSince } : {}),
              activity: reviseActivity({
                stored: activityById.get(row.id) ?? null,
                sessionChanged,
                sessionStartMs: m.onlineSince ? Date.parse(m.onlineSince) : null,
                // Pre-touch lastSeenAt: when the model was last confirmed online BEFORE now —
                // exact to the sync cadence, which is what makes the tail patch trustworthy.
                lastSeenMs: row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : null,
                nowMs: now.getTime(),
              }),
              peakViewers: Math.max(m.viewers, row.peakViewers ?? 0),
              profileImageUrl: m.profileImageUrl,
              thumbUrl: m.thumbUrl,
            },
          }),
        ),
      );
      updated += Math.min(WRITE_BATCH, pending.length - i);
    }

    // Bulk lastSeenAt touch: one uniform value for every model in the roster, so raw chunked
    // UPDATEs (Knex, bypassing Strapi's query layer) do in ~6 statements what per-row writes
    // would do in thousands. Deliberately does NOT set updated_at — the full-refresh throttle
    // above depends on it staying put. Rows created this sync are re-touched harmlessly.
    // The value must match what Strapi's own layer stores per dialect: sqlite keeps datetimes
    // as epoch-ms NUMBERS (an ISO string here once corrupted the column with mixed types —
    // SQLite orders every TEXT above every number, silently breaking the retention/capture
    // range queries); Postgres parses the ISO string into timestamp fine.
    try {
      const meta = strapi.db.metadata.get(UID);
      const column = meta.attributes.lastSeenAt as { columnName?: string };
      const isSqlite = String(strapi.db.config.connection.client ?? '').includes('sqlite');
      const touchValue = isSqlite ? now.getTime() : nowIso;
      for (let i = 0; i < keys.length; i += KEY_CHUNK) {
        await strapi.db
          .connection(meta.tableName)
          .whereIn('key', keys.slice(i, i + KEY_CHUNK))
          .update({ [column.columnName ?? 'last_seen_at']: touchValue });
      }
    } catch (err) {
      // Freshness degrades to the throttled writes (the stale gate's lastSeenAt clause);
      // never fail the sync over it.
      strapi.log.error(`[cam-model] lastSeenAt bulk touch failed: ${String(err)}`);
    }

    // The single most valuable heartbeat: one healthy sync proves the frontend poller, both
    // provider feeds, the shared secret, and this endpoint in one signal. Fire-and-forget
    // (never awaited) — this request is latency-sensitive against the caller's 30s timeout.
    // Degraded feeds ping /fail (the frontend keeps syncing its RETAINED roster during a feed
    // outage, so without this the check would stay green through a frozen-feed incident);
    // everything else that breaks the chain silences the check, which is what Healthchecks
    // alerts on.
    if (degraded.length > 0) {
      pingHeartbeat(strapi.log, 'cam-roster-sync', false, `provider feeds degraded: ${degraded.join(', ')}`);
    } else {
      pingHeartbeat(strapi.log, 'cam-roster-sync', true);
    }

    return { created, updated, skipped: roster.size - created - updated };
  },

  /**
   * Sitemap enumeration, PAGED — the core find is clamped at 100/page, but the registry is
   * far too big for one response the other way: measured 35k rows / 4.7MB JSON after a single
   * day of syncing (~33k newly-seen models per day of churn), so at 60-day retention this is
   * hundreds of thousands of rows. Each page maps 1:1 onto a models-sitemap.xml chunk.
   * Insertion order keeps a model's chunk fixed between crawler fetches (new models append
   * to the tail); `total` lets the sitemap index compute the chunk count.
   */
  async keys(ctx) {
    const page = Math.max(1, Math.floor(Number(ctx.query.page) || 1));
    const limit = Math.min(KEYS_PAGE_LIMIT, Math.max(1, Math.floor(Number(ctx.query.limit) || KEYS_PAGE_LIMIT)));
    const q = strapi.db.query(UID);
    const [rows, total] = await Promise.all([
      q.findMany({
        select: ['key', 'provider', 'username', 'lastSeenAt', 'updatedAt'],
        orderBy: { id: 'asc' },
        limit,
        offset: (page - 1) * limit,
      }),
      q.count({}),
    ]);
    return { data: rows, total };
  },
}));
