import { siteSettings } from '@/lib/siteSettings';
import { sitemapIndexXml, XML_HEADERS } from '@/lib/sitemapXml';

/**
 * Sitemap INDEX — the only sitemap URL that gets advertised. Children are split by section so
 * Search Console reports indexing per content type (and mirrors the Yoast layout production ran,
 * which this domain's crawl history already knows).
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const children = [
    '/discounts-sitemap.xml',
    '/reviews-sitemap.xml',
    '/blog-sitemap.xml',
    '/pages-sitemap.xml',
  ].map((p) => `${siteSettings.baseUrl}${p}`);

  return new Response(sitemapIndexXml(children), { headers: XML_HEADERS });
}
