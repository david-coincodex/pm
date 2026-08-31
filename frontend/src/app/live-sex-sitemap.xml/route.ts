import { siteSettings } from '@/lib/siteSettings';
import { routes } from '@/lib/routes';
import { getCamCategories } from '@/lib/cams/categories';
import { seedFilterFor, isDefaultFilter } from '@/lib/cams/filters';
import { staticEntry } from '@/lib/sitemapData';
import { urlsetXml, XML_HEADERS } from '@/lib/sitemapXml';

/**
 * The live-cams hub + its category pages. Model pages live in their own child
 * (models-sitemap.xml) so Search Console reports their indexing separately.
 * Registered in the sitemap index only while features.liveSex is on.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!siteSettings.features.liveSex) return new Response('Not found', { status: 404 });
  const categories = await getCamCategories();
  const urls = [
    staticEntry(routes.liveSex()),
    ...categories
      // The category duplicating the hub's default view (female) canonicals to the hub —
      // submitting it would only add "duplicate, not selected as canonical" noise in GSC.
      .filter((c) => !isDefaultFilter(seedFilterFor(c)))
      .map((c) => staticEntry(routes.camCategory(c.slug))),
  ];
  return new Response(urlsetXml(urls), { headers: XML_HEADERS });
}
