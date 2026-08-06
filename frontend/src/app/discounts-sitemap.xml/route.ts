import { getSitesForSitemap, type SitemapSite } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import { fetchAll, entry } from '@/lib/sitemapData';
import { urlsetXml, XML_HEADERS } from '@/lib/sitemapXml';

/** All /discounts/<slug>/ site pages (mains and subsites). */
export const dynamic = 'force-dynamic';

export async function GET() {
  const sites = await fetchAll<SitemapSite>(getSitesForSitemap);
  const urls = sites.map((s) => entry(s, routes.site(s.slug)));
  return new Response(urlsetXml(urls), { headers: XML_HEADERS });
}
