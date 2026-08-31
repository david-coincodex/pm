import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { buildLegacyRedirects } from './redirects.config.mjs';
import { routing } from './src/i18n/routing';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Required for the multi-stage production Docker image
  output: 'standalone',
  trailingSlash: true,
  /**
   * Upper bound on stale-while-revalidate. `revalidate` decides when a cached page becomes
   * stale; THIS decides how long a stale page may still be handed out while it regenerates —
   * and Next's default is 31536000 (one year). On pages built from live data that is wrong in
   * the worst way: a listing nobody had opened for hours served hours-old HTML, with 98% of the
   * models offline and their thumbnails 404ing, before the refresh it triggered ever landed.
   *
   * 60s means: past its revalidate window a page is regenerated for the request rather than
   * served from cache. That regeneration reads the in-memory cam snapshot, so it costs ~20 ms.
   */
  expireTime: 60,
  images: {
    unoptimized: true,
    remotePatterns: [
      // Strapi running locally or via Docker port-forward
      { protocol: 'http', hostname: 'localhost', port: '1339' },
      // Strapi internal Docker hostname (used by Next.js Image optimizer)
      { protocol: 'http', hostname: 'backend', port: '1339' },
      // Media served from the public site host via the promode-uploads Traefik router
      { protocol: 'https', hostname: 'staging.pornmode.com' },
      { protocol: 'https', hostname: 'pornmode.com' },
    ],
  },
  // Legacy WordPress URLs, answered by the routing layer before any app code runs.
  // See redirects.config.mjs for the rules and why they live there rather than in proxy.ts.
  async redirects() {
    return buildLegacyRedirects(routing.locales, routing.defaultLocale);
  },
  async headers() {
    // Static brand assets in /public. Next serves public/ files with no Cache-Control of its
    // own, so intermediaries fall back to short heuristics (Lighthouse measured a 4 h TTL via
    // Cloudflare). These files change ~never, and a change would ship under a new filename
    // anyway — a year + immutable is the standard answer.
    const immutable = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }];
    return [
      { source: '/payment-logos/:path*', headers: immutable },
      { source: '/flags/:path*', headers: immutable },
      {
        // Baseline security headers (Lighthouse Best Practices flags all of these as High
        // when absent). Neither Traefik nor Cloudflare sets any of them for this site.
        source: '/:path*',
        headers: [
          // One year, no `preload`: preload submits the domain to a browser-baked list and
          // is effectively irreversible — that needs an explicit decision, not a default.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Nothing embeds this site in a frame; blocks clickjacking.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // allow-popups (not plain same-origin): offer clicks open affiliate pages in new
          // tabs, and a hard COOP would sever those windows' ability to load correctly via
          // the opener relationship some trackers rely on.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
