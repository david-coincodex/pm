/**
 * Online-session history for cam models — the read side of the registry's `activity` json
 * column (see backend/src/api/cam-model/session-history.ts for the write side and the
 * precision model). Pairs are [startMin, endMin] in epoch MINUTES.
 *
 * Shared by the server page (the render gate) and the client heatmap (the timezone-aware
 * bucketing) — so no 'server-only' here.
 *
 * COUPLED to backend/src/api/cam-model/session-history.ts and .../constants.ts (no shared
 * package exists in this monorepo): parseActivity mirrors normalizeActivity + its tail patch,
 * SESSION_GAP_MS mirrors the backend constant (which carries an invariant tying it to
 * ROW_REFRESH_SLACK_MS), and ACTIVITY_DISPLAY_DAYS is the backend window minus its trim
 * slack. A change to pair validation, the gap rule, or the window must land in BOTH files.
 */
export type SessionPair = [startMin: number, endMin: number];

const MINUTE_MS = 60_000;
const HOUR_MIN = 60;
const DAY_MS = 24 * 60 * MINUTE_MS;
const WEEK_MS = 7 * DAY_MS;
/** The heatmap's window — mirrors the backend's ACTIVITY_WINDOW_DAYS minus its trim slack. */
export const ACTIVITY_DISPLAY_DAYS = 28;
/** Same gap rule as the backend: lastSeenAt further than this past a pair's end is a new session. */
const SESSION_GAP_MS = 2 * 60 * 60 * 1000;

/**
 * Hide the widget until the history says something: under this many hours (WITHIN the display
 * window) is noise. Hours only, deliberately no session-count minimum — a continuously-online
 * model's whole history merges into one long pair, and that single pair is the richest data
 * we have, not the noisiest.
 */
export const MIN_HEATMAP_HOURS = 6;

/**
 * The stored column defensively reduced to valid pairs (mirrors the backend's normalize —
 * malformed data renders as "no history", never as a crash). When `lastSeenAt` is given, the
 * final pair's end is pulled forward to it (within the gap window): lastSeenAt is bulk-touched
 * every sync, so it is fresher than the throttled write that recorded the pair.
 */
export function parseActivity(raw: unknown, lastSeenAt?: string | null): SessionPair[] {
  let value = raw;
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
  const last = pairs[pairs.length - 1];
  const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  if (last && Number.isFinite(lastSeenMs)) {
    const lastSeenMin = Math.floor(lastSeenMs / MINUTE_MS);
    if (lastSeenMin > last[1] && (lastSeenMin - last[1]) * MINUTE_MS <= SESSION_GAP_MS) {
      last[1] = lastSeenMin;
    }
  }
  return pairs;
}

/**
 * Timezone-independent facts, safe to compute during server render (used for the gate).
 * Windowed to the heatmap's own display range: stored history can be up to 60 days old for a
 * long-offline model (rows are only trimmed on write), and pairs the heatmap will never draw
 * must not pass the gate — that rendered an all-grey grid.
 */
export function activitySummary(pairs: SessionPair[], nowMs: number): { sessions: number; totalHours: number } {
  const windowStartMin = (nowMs - ACTIVITY_DISPLAY_DAYS * DAY_MS) / MINUTE_MS;
  let minutes = 0;
  let sessions = 0;
  for (const [start, end] of pairs) {
    const visible = Math.min(end, nowMs / MINUTE_MS) - Math.max(start, windowStartMin);
    if (visible <= 0) continue;
    sessions += 1;
    minutes += visible;
  }
  return { sessions, totalHours: minutes / HOUR_MIN };
}

/**
 * 168 occupancy values (Monday 00h first), 0..1: the share of observed weeks the model was
 * online during that local-time hour over the last 28 days. Runs in the browser — local Date
 * methods ARE the timezone conversion.
 *
 * Denominator is weeks actually observed (since the earliest recorded start, capped at 4), so
 * a model first seen ten days ago isn't under-read by the fixed 4-week window. DST shifts
 * mis-attribute at most one hour twice a year — irrelevant at this granularity.
 */
export function bucketLocalOccupancy(pairs: SessionPair[], nowMs: number): number[] {
  const minutes = new Array<number>(7 * 24).fill(0);
  const windowStartMs = nowMs - ACTIVITY_DISPLAY_DAYS * DAY_MS;

  let earliestStartMs = nowMs;
  for (const [start] of pairs) earliestStartMs = Math.min(earliestStartMs, start * MINUTE_MS);
  const observedMs = nowMs - Math.max(windowStartMs, earliestStartMs);
  // Fractional, not ceil: rounding 8 observed days up to 2 whole weeks would halve every
  // bucket for young models — the opposite of what this denominator exists to prevent.
  const weeksObserved = Math.min(4, Math.max(1, observedMs / WEEK_MS));

  for (const [startMin, endMin] of pairs) {
    let cursor = Math.max(startMin * MINUTE_MS, windowStartMs);
    const endMs = Math.min(endMin * MINUTE_MS, nowMs);
    while (cursor < endMs) {
      const d = new Date(cursor);
      const bucket = ((d.getDay() + 6) % 7) * 24 + d.getHours();
      const hourEndMs = cursor + ((60 - d.getMinutes()) * 60 - d.getSeconds()) * 1000 - d.getMilliseconds();
      const next = hourEndMs > cursor ? hourEndMs : cursor + MINUTE_MS; // loop guard
      minutes[bucket] += (Math.min(endMs, next) - cursor) / MINUTE_MS;
      cursor = next;
    }
  }

  return minutes.map((m) => Math.min(1, m / (weeksObserved * HOUR_MIN)));
}
