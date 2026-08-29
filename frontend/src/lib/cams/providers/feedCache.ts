import 'server-only';

/**
 * Fetch options for every provider feed request — THE decision that keeps the aggregator honest.
 *
 * The in-memory snapshot (registry.ts) is the ONLY runtime cache for feed data. Routing these
 * fetches through Next's data cache froze the site twice: outside a request context (the
 * background poller is a bare setInterval) Next serves an expired entry forever — its
 * revalidation only completes inside a request lifecycle — so every "refresh" rebuilt the
 * snapshot from identical stale bytes and restamped them as fresh. A fresh timestamp on frozen
 * data then defeats the registry's own TTL and max-stale guards, which trust the stamp.
 * Measured: six consecutive refreshes logging exactly 3351 models while 100% of the listed
 * rooms were offline upstream.
 *
 * Build time is the one exception: an uncached fetch inside static prerender is a
 * dynamic-usage error (it demotes the listing routes from ● to ƒ), and the build only needs
 * one consistent read anyway.
 */
export const FEED_CACHE =
  process.env.NEXT_PHASE === 'phase-production-build'
    ? ({ next: { revalidate: 60 } } as const)
    : ({ cache: 'no-store' } as const);
