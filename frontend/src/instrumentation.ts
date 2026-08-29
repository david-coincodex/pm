/**
 * Runs once per server boot (Next instrumentation hook).
 *
 * Warm the live-cams snapshot before the first visitor arrives. Without this, boot works like:
 * first request → serve the BUILD-TIME page (the self-hosted route cache serves stale at any
 * age and regenerates in the background — expireTime only shapes CDN headers) → that background
 * regeneration is ALSO the first feed fetch. So after every deploy or restart, early visitors
 * saw deploy-time-old models. Warming here means the first regeneration already has live data,
 * and it starts the 45 s feed poller at boot instead of at first traffic.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Imported lazily: instrumentation is bundled separately from the RSC graph, and the
  // registry's import chain must only load inside the node server runtime.
  const { getOnlineModels } = await import('@/lib/cams/registry');
  await getOnlineModels().catch(() => {
    /* feeds down at boot — the poller keeps retrying; pages degrade gracefully */
  });
}
