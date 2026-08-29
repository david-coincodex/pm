import type { MetadataRoute } from 'next';
import { siteSettings } from '@/lib/siteSettings';

/**
 * /robots.txt — the launch shipped without one (the WordPress site had it), so the URL served
 * the HTML 404 page. A 404 robots.txt means "no restrictions", so nothing was blocked, but the
 * sitemap reference was lost with it and crawlers had to find the sitemap via Search Console
 * alone.
 *
 * /offer/ is disallowed deliberately: the affiliate interstitials are noindexed anyway, carry
 * no content, and every crawl of one fires a server-side analytics event (bot-filtered, but
 * there is no reason to invite the traffic).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // /out/ and /account/ join it: the cam-affiliate redirect (same server-counted
      // pattern as /offer/, /out/ additionally sends X-Robots-Tag: noindex) and the
      // logged-in account pages have nothing to index.
      // /live-sex/filter/ is the multi-select browse space: every view there duplicates a
      // canonical listing, and the combinations are unbounded — no reason to spend crawl budget.
      disallow: ['/offer/', '/api/', '/out/', '/account/', '/live-sex/filter/'],
    },
    sitemap: `${siteSettings.baseUrl}/sitemap.xml`,
  };
}
