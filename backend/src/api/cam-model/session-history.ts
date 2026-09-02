import { ACTIVITY_MAX_SESSIONS, ACTIVITY_WINDOW_DAYS, SESSION_GAP_MS } from './constants';

/**
 * Compact online-session history stored in the cam-model `activity` json column and rendered
 * by the frontend's usual-online-hours heatmap. Epoch MINUTES, not ms: half the JSON size,
 * and minute precision is far below the sync cadence anyway.
 *
 * COUPLED to frontend/src/lib/cams/activity.ts (no shared package exists in this monorepo):
 * its parseActivity mirrors normalizeActivity + the tail patch below, and its SESSION_GAP_MS
 * and display window mirror ../constants. A change to pair validation, the gap rule, or the
 * window must be made in BOTH files or stored and rendered history silently disagree.
 */
export type SessionPair = [startMin: number, endMin: number];

const MINUTE_MS = 60_000;
const DAY_MIN = 24 * 60;
/**
 * onlineSince older than this is a marathon stream or a garbage seconds_online counter —
 * cap what enters the history. This is the SINGLE owner of the 7-day rule: the controller's
 * cleanOnlineSince deliberately does not floor old values (a moving floor made sessionChanged
 * fire perpetually), so the raw-but-stable timestamp arrives here and is capped per-pair.
 */
const MAX_SESSION_AGE_MIN = 7 * DAY_MIN;

/**
 * Whatever the json column holds — pairs written by us, a string from a raw driver edge, or
 * garbage — reduced to valid pairs. Malformed history must never throw and poison a sync.
 */
export function normalizeActivity(stored: unknown): SessionPair[] {
  let value = stored;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const pairs: SessionPair[] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [start, end] = entry;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) continue;
    pairs.push([start, end]);
  }
  return pairs;
}

/**
 * Fold the current sighting into the stored history. Pure — the controller decides WHEN to
 * write (throttling, sessionChanged); this only decides what the history becomes.
 *
 * Precision model: starts are exact (the feed reports seconds_online); ends advance on every
 * full write AND get tail-patched from lastSeenAt, which the sync bulk-touches every run — so
 * a finished session's end is accurate to ~one sync cadence, not the hourly write throttle.
 */
export function reviseActivity(opts: {
  stored: unknown;
  /** The controller's verdict: incoming onlineSince names a different session than wentOnlineAt. */
  sessionChanged: boolean;
  /** Sanitized incoming onlineSince; null when the feed row lacks it (some BongaCams rows). */
  sessionStartMs: number | null;
  /** The row's lastSeenAt BEFORE this sync's bulk touch — when the model was last confirmed online. */
  lastSeenMs: number | null;
  nowMs: number;
}): SessionPair[] {
  const { sessionChanged, sessionStartMs, lastSeenMs, nowMs } = opts;
  const pairs = normalizeActivity(opts.stored);
  const nowMin = Math.floor(nowMs / MINUTE_MS);

  const last = pairs[pairs.length - 1];
  if (last && lastSeenMs !== null) {
    // Tail patch: the model was provably online at lastSeenAt. If that falls just past the
    // recorded end (within the gap window), the recorded end is merely a stale throttled
    // write — pull it forward so finished sessions keep their true length.
    const lastSeenMin = Math.min(Math.floor(lastSeenMs / MINUTE_MS), nowMin);
    if (lastSeenMin > last[1] && (lastSeenMin - last[1]) * MINUTE_MS <= SESSION_GAP_MS) {
      last[1] = lastSeenMin;
    }
  }

  // Clamp the reported start into [now - 7d, now]: future = clock skew, ancient = feed junk.
  // No onlineSince at all → the session starts at this first write; coarse but honest.
  const startMin =
    sessionStartMs !== null
      ? Math.min(Math.max(Math.floor(sessionStartMs / MINUTE_MS), nowMin - MAX_SESSION_AGE_MIN), nowMin)
      : nowMin;

  // Gap guard: without onlineSince, sessionChanged can never fire — a model returning after
  // days offline must still start a fresh pair, not stretch the old one across the gap.
  const gapped = last !== undefined && (nowMin - last[1]) * MINUTE_MS > SESSION_GAP_MS;
  if (sessionChanged || last === undefined || gapped) {
    // Keep pairs disjoint and sorted even when the provider revises seconds_online backwards,
    // and never inverted even when the clock steps backwards between syncs (a start > end
    // pair would be silently dropped by the next normalize instead of surviving clamped).
    const start = last ? Math.max(startMin, last[1]) : startMin;
    pairs.push([start, Math.max(start, nowMin)]);
  } else {
    last[1] = Math.max(last[1], nowMin);
  }

  const cutoffMin = nowMin - ACTIVITY_WINDOW_DAYS * DAY_MIN;
  return pairs.filter(([, end]) => end >= cutoffMin).slice(-ACTIVITY_MAX_SESSIONS);
}
