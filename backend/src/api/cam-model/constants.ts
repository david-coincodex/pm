/**
 * Shared cam-model constants — the sync controller and the crons in src/cron/cam-model-tasks.ts
 * are coupled through these numbers, so they live in ONE place with their invariants.
 */
export const CAM_MODEL_UID = 'api::cam-model.cam-model';

/**
 * A row's lastSeenAt is only rewritten when older than this — keeps sync writes to a few
 * hundred per 5-min roster, not thousands. CONSEQUENCE: a continuously-online model's stored
 * lastSeenAt can legitimately be (slack + sync cadence) ≈ 65 min stale.
 */
export const LAST_SEEN_SLACK_MS = 60 * 60 * 1000;

/**
 * "Recently online" for the snapshot-capture cron. INVARIANT: must exceed
 * LAST_SEEN_SLACK_MS + the frontend's 5-min sync cadence, or live models whose row is
 * legitimately ~65 min stale silently drop out of capture (that bug shipped once).
 */
export const ONLINE_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Max photos per model; the oldest rotates out. One owner — the crons must not redefine it. */
export const PHOTO_CAP = 4;

/** Models unseen for this long are deleted — page 404s, drops out of the sitemap. */
export const RETENTION_DAYS = Number(process.env.CAM_MODEL_RETENTION_DAYS) || 60;
