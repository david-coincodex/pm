/**
 * Shared cam-model constants — the sync controller and the crons in src/cron/cam-model-tasks.ts
 * are coupled through these numbers, so they live in ONE place with their invariants.
 */
export const CAM_MODEL_UID = 'api::cam-model.cam-model';

/**
 * A row's FULL refresh (identity/tags/peak/activity via strapi.db.query, which bumps
 * updatedAt) only happens when updatedAt is older than this — keeps per-row writes to a few
 * hundred per 5-min roster, not thousands. lastSeenAt is NOT throttled by this: the sync
 * bulk-touches it for the whole online roster every run, so it is exact to the sync cadence.
 */
export const ROW_REFRESH_SLACK_MS = 60 * 60 * 1000;

/**
 * "Recently online" for the snapshot-capture cron. Since the sync started bulk-touching
 * lastSeenAt every run this is safe by a wide margin (lastSeenAt is at most ~5 min stale for
 * an online model); kept at 2h so a few missed syncs don't drop live models out of capture.
 */
export const ONLINE_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Incoming onlineSince differing from the stored wentOnlineAt by more than this counts as a
 * NEW session. The feeds report seconds_online, so the derived timestamp drifts by seconds
 * per poll for one continuous stream — while a real reconnect jumps it by the whole prior
 * session length. Anything between is noise we deliberately ignore.
 */
export const SESSION_TOLERANCE_MS = 15 * 60 * 1000;

/**
 * A gap between "now" and the last recorded activity end larger than this starts a new
 * session pair instead of extending the old one. INVARIANT: must exceed
 * ROW_REFRESH_SLACK_MS + the frontend's 5-min sync cadence, or the hourly-throttled writes
 * would split one continuous stream into fragments (same reasoning as ONLINE_WINDOW_MS).
 */
export const SESSION_GAP_MS = 2 * 60 * 60 * 1000;

/** Activity history horizon: the heatmap shows 28 days; one extra day of slack for trimming. */
export const ACTIVITY_WINDOW_DAYS = 29;

/** Hard cap on stored session pairs per model (~2.5KB of JSON at worst). */
export const ACTIVITY_MAX_SESSIONS = 200;

/** Max photos per model; the oldest rotates out. One owner — the crons must not redefine it. */
export const PHOTO_CAP = 4;

/** Models unseen for this long are deleted — page 404s, drops out of the sitemap. */
export const RETENTION_DAYS = Number(process.env.CAM_MODEL_RETENTION_DAYS) || 60;
