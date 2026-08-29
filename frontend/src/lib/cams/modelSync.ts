import 'server-only';
import { STRAPI_FETCH_URL } from '@/lib/strapi';
import type { OnlineSnapshot } from './registry';

/**
 * Pushes the live roster into the persistent cam-model registry (Strapi, POST
 * /api/cam-models/sync) so "ever existed" survives restarts. Rides the snapshot refresh:
 * fire-and-forget off the request path.
 *
 * Cheap by design at both ends: this end throttles to one POST per SYNC_INTERVAL_MS; the
 * backend end only writes rows that are new, an hour stale, or actually changed. The payload
 * (~3k models, ~600KB) needs the backend's raised jsonLimit (config/middlewares.ts).
 */
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

type SyncBox = { lastAttemptMs: number; inFlight: boolean; warnedNoSecret: boolean };

// globalThis, not module scope: Next may instantiate this module once per bundle graph.
const box: SyncBox = ((globalThis as Record<string, unknown>).__pmCamModelSync ??= {
  lastAttemptMs: 0,
  inFlight: false,
  warnedNoSecret: false,
}) as SyncBox;

export function syncModels(snapshot: OnlineSnapshot): void {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const secret = process.env.CAM_SYNC_SECRET;
  if (!secret) {
    if (!box.warnedNoSecret) {
      box.warnedNoSecret = true;
      console.warn('[cams] CAM_SYNC_SECRET unset — model registry sync disabled');
    }
    return;
  }
  const now = Date.now();
  if (box.inFlight || now - box.lastAttemptMs < SYNC_INTERVAL_MS) return;
  if (snapshot.byViewers.length === 0) return; // an empty roster teaches the registry nothing
  box.lastAttemptMs = now;
  box.inFlight = true;

  const models = snapshot.byViewers.map((m) => ({
    provider: m.provider,
    username: m.username,
    displayName: m.displayName,
    gender: m.gender,
    country: m.country ?? null,
    languages: m.languages,
    tags: m.tags,
    viewers: m.viewers,
    profileImageUrl: m.profileImageUrl ?? null,
    thumbUrl: m.thumbUrl ?? null,
  }));

  void fetch(`${STRAPI_FETCH_URL}/api/cam-models/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cam-sync-secret': secret },
    body: JSON.stringify({ models }),
    cache: 'no-store',
    // Same discipline as the feed fetches: a stalled connection must not hold the
    // single-flight lock for undici's multi-minute defaults. Generous — it's ~1MB + ~250 writes.
    signal: AbortSignal.timeout(30_000),
  })
    .then(async (res) => {
      if (!res.ok) {
        console.error(`[cams] model sync failed: ${res.status} ${await res.text().catch(() => '')}`);
        return;
      }
      const { created, updated } = (await res.json()) as { created: number; updated: number };
      if (created > 0 || updated > 0) console.log(`[cams] model sync: ${created} created, ${updated} updated`);
    })
    .catch((err) => {
      console.error('[cams] model sync failed:', err instanceof Error ? err.message : err);
    })
    .finally(() => {
      box.inFlight = false;
    });
}
