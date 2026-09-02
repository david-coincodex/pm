import type { Core } from '@strapi/strapi';
import { runBackfillTick } from '../api/cam-model/activity-backfill';
import type { TaskResult } from './heartbeat';
import {
  CAM_MODEL_UID as UID,
  ONLINE_WINDOW_MS,
  PHOTO_CAP,
  RETENTION_DAYS,
} from '../api/cam-model/constants';

/**
 * The cam-model maintenance crons, registered in config/server.ts. Three independent tasks —
 * profile ingestion, snapshot capture and cleanup — each with its own overlap guard, so their
 * throughputs tune independently and a slow run of one never starves another.
 *
 * Sizing is driven by MEASURED churn, not roster size: ~33k newly-seen models per day
 * (one day of dev syncing produced 35k rows), so at 60-day retention the registry holds
 * hundreds of thousands of rows. Every query here must stay bounded accordingly.
 */

/** Ingest at most this many profile photos per run. Must comfortably exceed the DAILY rate of
 * new bc models (~6.4k/day measured, so 300/h ≈ 7.2k/day) or the backlog grows forever. */
const PROFILE_BACKFILL_PER_RUN = 300;
/** Only ingest profiles for models seen this recently — bounds the backlog to the active
 * population instead of everything ever seen, and keeps ingestion from racing cleanup
 * (an expired row can never be a candidate). */
const PROFILE_FLOOR_MS = 48 * 60 * 60 * 1000;
/** Snapshot captures per run, split between never-captured and longest-uncaptured. */
const SNAPSHOTS_PER_RUN = 150;
/** Reserved share for the refresh (stale) branch: without it, ~33k new models/day fill every
 * run and NO model ever collects its second photo (measured: zero models at the 4-photo cap). */
const SNAPSHOTS_FRESH_MAX = 100;
const CONCURRENCY = 5;
/** Give up on a cleanup run that accumulates this many undeletable rows — something is wrong. */
const CLEANUP_MAX_FAILURES = 500;

type CamModelRow = {
  id: number;
  key: string;
  provider: 'cb' | 'bc';
  username: string;
  profileImageUrl: string | null;
  profileImageIngestedUrl: string | null;
  thumbUrl: string | null;
  photos?: { id: number }[];
};

type CamModelService = {
  capturePhoto(model: { id: number; key: string }, url: string): Promise<void>;
  rotatePhotos(modelId: number, cap?: number): Promise<void>;
  /** Returns the number of photos that FAILED to delete. */
  removePhotos(photos: { id: number }[]): Promise<number>;
};

// Overlap guards, catch/stack logging and heartbeat pings live in withHeartbeat
// (./heartbeat.ts), applied at registration in config/server.ts — REGISTERED implies
// MONITORED. The task bodies below are plain logic; return a TaskResult to report a
// completed-but-degraded run as /fail.

async function inChunks<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

const service = (strapi: Core.Strapi) => strapi.service(UID) as unknown as CamModelService;

/**
 * Daily: delete models whose lastSeenAt is older than the retention window. Media has NO
 * cascade — entry deletion orphans upload files — so photos go through the service's
 * removePhotos first. Failed rows are excluded from re-queries (the loop re-reads from the
 * top after each batch) so one poisoned row can't spin it forever.
 */
export async function cleanupExpired({ strapi }: { strapi: Core.Strapi }): Promise<TaskResult> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  strapi.log.info(`[cam-model] cleanup: scanning for models unseen since ${cutoff}`);
  const q = strapi.db.query(UID);
  const svc = service(strapi);
  let deleted = 0;
  // Set at the break site, not re-derived afterwards — the ping decision and the loop's
  // abort rule must be the same fact, or they drift apart when the rule changes.
  let aborted = false;
  const failedIds: number[] = [];
  for (;;) {
    const rows: CamModelRow[] = await q.findMany({
      where: { lastSeenAt: { $lt: cutoff }, ...(failedIds.length ? { id: { $notIn: failedIds } } : {}) },
      populate: { photos: true },
      limit: 500,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      try {
        // A photo that would not delete keeps its ROW alive too — deleting the model while
        // its media still exists is exactly how files orphan (no cascade). The row stays in
        // the expired set and is retried on the next run.
        const failed = await svc.removePhotos(row.photos ?? []);
        if (failed > 0) {
          failedIds.push(row.id);
          continue;
        }
        await q.delete({ where: { id: row.id } });
        deleted += 1;
      } catch (err) {
        failedIds.push(row.id);
        strapi.log.warn(`[cam-model] cleanup: failed to delete ${row.key}: ${String(err)}`);
      }
    }
    if (failedIds.length >= CLEANUP_MAX_FAILURES) {
      strapi.log.error(`[cam-model] cleanup: aborting run after ${failedIds.length} failures`);
      aborted = true;
      break;
    }
  }
  if (deleted > 0 || failedIds.length > 0) {
    strapi.log.info(
      `[cam-model] cleanup: deleted ${deleted} expired models` +
        (failedIds.length ? `, ${failedIds.length} failed` : ''),
    );
  }
  // ANY persistent deletion failure is a /fail, not just the abort: a stable sub-abort set
  // of poisoned rows means retention has silently stalled for them — exactly what the check
  // exists to surface. Failed rows retry next run, so a transient blip self-resolves.
  if (aborted) return { ok: false, detail: `aborted after ${failedIds.length} failed deletions` };
  if (failedIds.length > 0) return { ok: false, detail: `deleted ${deleted}, ${failedIds.length} rows failed to delete` };
  return { ok: true, detail: deleted > 0 ? `deleted ${deleted}` : undefined };
}

/**
 * Hourly: ingest BongaCams profile photos whose URL hasn't been downloaded yet (Chaturbate
 * publishes none). The pending set is `profileImageUrl != profileImageIngestedUrl`, compared
 * in JS — the query engine cannot compare two columns — but bounded by the recently-seen
 * floor so the scan tracks the active population, not the whole registry. The marker is
 * stamped even on failure so a dead URL cannot clog the queue.
 */
export async function ingestProfilePhotos({ strapi }: { strapi: Core.Strapi }): Promise<TaskResult> {
  const q = strapi.db.query(UID);
  const svc = service(strapi);
  const floor = new Date(Date.now() - PROFILE_FLOOR_MS).toISOString();
  // Never-attempted rows first (SQL-filterable: ingested marker IS NULL, hard limit).
  // Changed-URL retries can't be expressed in SQL (column-to-column compare), but they are
  // near-zero in practice (URLs are content-hashed) — a small bounded window JS-diffs them.
  const freshRows: CamModelRow[] = await q.findMany({
    where: {
      provider: 'bc',
      profileImageUrl: { $notNull: true },
      profileImageIngestedUrl: { $null: true },
      lastSeenAt: { $gt: floor },
    },
    select: ['id', 'key', 'profileImageUrl', 'profileImageIngestedUrl'],
    limit: PROFILE_BACKFILL_PER_RUN,
  });
  const retryWindow: CamModelRow[] =
    freshRows.length < PROFILE_BACKFILL_PER_RUN
      ? await q.findMany({
          where: {
            provider: 'bc',
            profileImageUrl: { $notNull: true },
            profileImageIngestedUrl: { $notNull: true },
            lastSeenAt: { $gt: floor },
          },
          select: ['id', 'key', 'profileImageUrl', 'profileImageIngestedUrl'],
          limit: PROFILE_BACKFILL_PER_RUN * 4,
        })
      : [];
  const pending = [
    ...freshRows,
    ...retryWindow.filter((r) => r.profileImageUrl && r.profileImageUrl !== r.profileImageIngestedUrl),
  ].slice(0, PROFILE_BACKFILL_PER_RUN);
  let ingested = 0;
  await inChunks(pending, CONCURRENCY, async (row) => {
    try {
      await svc.capturePhoto(row, row.profileImageUrl as string);
      await svc.rotatePhotos(row.id, PHOTO_CAP);
      ingested += 1;
    } catch (err) {
      strapi.log.warn(`[cam-model] profile ingest failed for ${row.key}: ${String(err)}`);
    }
    await q.update({
      where: { id: row.id },
      data: { profileImageIngestedUrl: row.profileImageUrl },
    });
  });
  if (ingested > 0) strapi.log.info(`[cam-model] profiles: ingested ${ingested} (${pending.length} attempted)`);
  // Partial failures are routine (dead URLs) — but a run where EVERY attempt failed means the
  // pipeline is down (CDN change, blocked IP, broken upload provider), and since the markers
  // are stamped regardless, the queue drains as if healthy. Report it; don't let it be green.
  if (pending.length > 0 && ingested === 0) {
    return { ok: false, detail: `all ${pending.length} profile ingest attempts failed` };
  }
}

/**
 * Hourly: capture live snapshots for recently-online models. The run is SPLIT between
 * never-captured models (capped at SNAPSHOTS_FRESH_MAX) and the longest-uncaptured ones —
 * without the reserved stale share, daily churn fills every run with first-timers and no
 * model ever collects a photo history. Explicit two queries because NULL ordering under
 * `asc` differs between SQLite and Postgres. photosCapturedAt is stamped even on failure
 * so a dead thumb URL cannot starve the queue.
 */
export async function captureSnapshots({ strapi }: { strapi: Core.Strapi }): Promise<TaskResult> {
  const q = strapi.db.query(UID);
  const svc = service(strapi);
  const onlineCutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
  const fresh: CamModelRow[] = await q.findMany({
    where: { lastSeenAt: { $gt: onlineCutoff }, photosCapturedAt: { $null: true } },
    select: ['id', 'key', 'provider', 'username', 'thumbUrl'],
    limit: SNAPSHOTS_FRESH_MAX,
  });
  const stale: CamModelRow[] = await q.findMany({
    where: { lastSeenAt: { $gt: onlineCutoff }, photosCapturedAt: { $notNull: true } },
    select: ['id', 'key', 'provider', 'username', 'thumbUrl'],
    orderBy: { photosCapturedAt: 'asc' },
    limit: SNAPSHOTS_PER_RUN - Math.min(fresh.length, SNAPSHOTS_FRESH_MAX),
  });
  const nowIso = new Date().toISOString();
  let captured = 0;
  await inChunks([...fresh, ...stale], CONCURRENCY, async (row) => {
    const url =
      row.provider === 'cb'
        ? `https://thumb.live.mmcdn.com/riw/${row.username}.jpg`
        : row.thumbUrl;
    try {
      if (url) {
        await svc.capturePhoto(row, url);
        await svc.rotatePhotos(row.id, PHOTO_CAP);
        captured += 1;
      }
    } catch (err) {
      strapi.log.warn(`[cam-model] snapshot capture failed for ${row.key}: ${String(err)}`);
    }
    await q.update({ where: { id: row.id }, data: { photosCapturedAt: nowIso } });
  });
  if (captured > 0) {
    strapi.log.info(`[cam-model] snapshots: ${captured} captured (${fresh.length} first-time, ${stale.length} refresh)`);
  }
  // Same rule as profiles: an all-attempts-failed run is a dead pipeline masked by the
  // stamped-anyway markers — /fail, not green.
  const attempted = fresh.length + stale.length;
  if (attempted > 0 && captured === 0) {
    return { ok: false, detail: `all ${attempted} snapshot captures failed` };
  }
}

/**
 * One-shot activity-history import (see activity-backfill.ts): pages the registry forward
 * each tick until exhausted, then flips a core-store flag and never works again. Kept in the
 * cron table permanently — a done-state tick is one store read.
 */
export async function backfillActivity({ strapi }: { strapi: Core.Strapi }): Promise<TaskResult> {
  // Done-state ticks ping success via the wrapper: "the scheduler is alive" is exactly what
  // the check watches.
  await runBackfillTick(strapi);
}
