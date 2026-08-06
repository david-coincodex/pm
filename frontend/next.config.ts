import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { buildLegacyRedirects } from './redirects.config.mjs';
import { routing } from './src/i18n/routing';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Required for the multi-stage production Docker image
  output: 'standalone',
  trailingSlash: true,
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
    ];
  },
};

export default withNextIntl(nextConfig);
