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
};

export default withNextIntl(nextConfig);
