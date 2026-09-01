/**
 * One-off backfill of cam-model `activity` histories from lemoncams' public cam-log API,
 * so heatmaps have up to 28 days of data on day one instead of accruing from zero.
 *
 * Their format: per UTC day → per hour → observed 10-minute slots
 *   {"days":[{"2026-08-06":[{"09":["00","10","20"]}, ...]}]}
 * (verified UTC against our own feed-reported session starts). Ours: [startMin, endMin]
 * epoch-minute pairs — see src/api/cam-model/session-history.ts. Consecutive slots collapse
 * into pairs; a missing single slot (one skipped poll) is bridged, larger gaps split.
 *
 * Merging is a set-union with the existing column, so the script is idempotent and safe to
 * re-run; it deliberately does NOT touch updated_at (the sync's full-refresh throttle reads
 * it), and later sync writes preserve backfilled pairs (reviseActivity extends/appends onto
 * stored history, never truncates it).
 *
 * Run inside the backend container / server (needs node_modules + DB env):
 *   node scripts/backfill-cam-activity.mjs --limit 300 [--dry-run] [--min-peak 50] [--delay-ms 350]
 *
 * Be polite: this hits a third party. Keep --delay-ms >= 300 and --limit modest per run.
 */
import knexFactory from 'knex';

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? 'true'] : [])).filter((e) => e.length),
);
const LIMIT = Number(args.limit ?? 200);
const MIN_PEAK = Number(args['min-peak'] ?? 0);
const DELAY_MS = Math.max(250, Number(args['delay-ms'] ?? 350));
const DRY_RUN = args['dry-run'] === 'true' || args['dry-run'] === '';

const PROVIDER_SLUGS = { cb: 'chaturbate', bc: 'bongacams' };
const API = 'https://api-v2-prod.lemoncams.com/main';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

const SLOT_MIN = 10; // their poll granularity
const BRIDGE_MIN = 20; // one missed poll is bridged; anything larger splits the session
const WINDOW_DAYS = 29; // must match ACTIVITY_WINDOW_DAYS in src/api/cam-model/constants.ts
const MAX_SESSIONS = 200; // must match ACTIVITY_MAX_SESSIONS

const client = process.env.DATABASE_CLIENT ?? 'sqlite';
const knex = knexFactory(
  client === 'sqlite'
    ? { client: 'better-sqlite3', connection: { filename: process.env.DATABASE_FILENAME ?? '.tmp/data.db' }, useNullAsDefault: true }
    : {
        client: 'postgres',
        connection: {
          host: process.env.DATABASE_HOST,
          port: Number(process.env.DATABASE_PORT ?? 5432),
          database: process.env.DATABASE_NAME,
          user: process.env.DATABASE_USERNAME,
          password: process.env.DATABASE_PASSWORD,
          ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
        },
      },
);

/** Their day/hour/slot tree → sorted disjoint [startMin, endMin] pairs (UTC). */
function slotsToPairs(days) {
  const slotStarts = [];
  for (const day of days ?? []) {
    for (const [date, hours] of Object.entries(day)) {
      const dayMs = Date.parse(`${date}T00:00:00Z`);
      if (!Number.isFinite(dayMs)) continue;
      for (const hourEntry of hours) {
        for (const [hour, slots] of Object.entries(hourEntry)) {
          for (const slot of slots) {
            slotStarts.push(dayMs / 60000 + Number(hour) * 60 + Number(slot));
          }
        }
      }
    }
  }
  slotStarts.sort((a, b) => a - b);
  const pairs = [];
  for (const start of slotStarts) {
    const last = pairs[pairs.length - 1];
    if (last && start - (last[1] - SLOT_MIN) <= BRIDGE_MIN) last[1] = start + SLOT_MIN;
    else pairs.push([start, start + SLOT_MIN]);
  }
  return pairs;
}

/** Same defensive normalization as the backend's normalizeActivity. */
function normalize(stored) {
  let value = stored;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.filter((e) => Array.isArray(e) && e.length === 2 && Number.isInteger(e[0]) && Number.isInteger(e[1]) && e[0] <= e[1]);
}

/** Union of both histories: sort, merge overlaps/adjacency, trim window, cap. */
function merge(theirs, ours, nowMin) {
  const all = [...theirs, ...ours].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of all) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  const cutoff = nowMin - WINDOW_DAYS * 24 * 60;
  return out.filter(([, e]) => e >= cutoff).slice(-MAX_SESSIONS);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = await knex('cam_models')
  .select('id', 'key', 'provider', 'username', 'activity')
  .where('peak_viewers', '>=', MIN_PEAK)
  .orderBy('peak_viewers', 'desc')
  .limit(LIMIT);

console.log(`[backfill] ${rows.length} candidates (limit ${LIMIT}, min-peak ${MIN_PEAK}, dry-run ${DRY_RUN})`);
const nowMin = Math.floor(Date.now() / 60000);
let updated = 0;
let empty = 0;
let failed = 0;

for (const row of rows) {
  const slug = PROVIDER_SLUGS[row.provider];
  if (!slug) continue;
  try {
    const res = await fetch(`${API}?provider=${slug}&username=${encodeURIComponent(row.username)}&function=cam-log-load`, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      failed += 1;
      console.warn(`[backfill] ${row.key}: HTTP ${res.status}`);
    } else {
      const theirs = slotsToPairs((await res.json()).days);
      if (theirs.length === 0) {
        empty += 1;
      } else {
        const ours = normalize(row.activity);
        const merged = merge(theirs, ours, nowMin);
        const addedMin = merged.reduce((n, [s, e]) => n + e - s, 0) - ours.reduce((n, [s, e]) => n + e - s, 0);
        if (!DRY_RUN) await knex('cam_models').where('id', row.id).update({ activity: JSON.stringify(merged) });
        updated += 1;
        console.log(`[backfill] ${row.key}: +${Math.round(addedMin / 60)}h across ${merged.length} pairs (had ${ours.length})`);
      }
    }
  } catch (err) {
    failed += 1;
    console.warn(`[backfill] ${row.key}: ${err.message ?? err}`);
  }
  await sleep(DELAY_MS);
}

console.log(`[backfill] done: ${updated} updated, ${empty} without data, ${failed} failed`);
await knex.destroy();
