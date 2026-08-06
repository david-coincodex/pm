import {
  getBundlesForSitemap,
  getSalesForSitemap,
  getCategoriesForSitemap,
  getPagesForSitemap,
  type SitemapBundle,
  type SitemapSale,
  type SitemapCategory,
  type SitemapPage,
} from '@/lib/strapi';
import { routes } from '@/lib/routes';
import { siteSettings } from '@/lib/siteSettings';
import { fetchAll, entry, staticEntry } from '@/lib/sitemapData';
import { urlsetXml, XML_HEADERS } from '@/lib/sitemapXml';

/**
 * Everything that isn't a site, review, or blog URL: the home page, the listing pages
 * (/categories/ included — it was missing from the old sitemap entirely), category pages,
 * bundles (feature-flagged), sales, and CMS pages.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const [bundles, sales, categories, pages] = await Promise.all([
    siteSettings.features.bundles ? fetchAll<SitemapBundle>(getBundlesForSitemap) : Promise.resolve([]),
    fetchAll<SitemapSale>(getSalesForSitemap),
    fetchAll<SitemapCategory>(getCategoriesForSitemap),
    fetchAll<SitemapPage>(getPagesForSitemap),
  ]);

  const urls = [
    staticEntry(routes.home()),
    ...(siteSettings.features.bundles ? [staticEntry(routes.bundles())] : []),
    staticEntry(routes.categories()),
    ...categories.map((c) => entry(c, routes.category(c.slug))),
    ...bundles.map((b) => entry(b, routes.bundle(b.slug))),
    ...sales.map((s) => entry(s, routes.sale(s.slug))),
    ...pages.map((p) => entry(p, routes.page(p.slug))),
  ];
  return new Response(urlsetXml(urls), { headers: XML_HEADERS });
}
