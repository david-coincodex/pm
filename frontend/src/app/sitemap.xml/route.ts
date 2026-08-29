import { siteSettings } from '@/lib/siteSettings';
import { sitemapIndexXml, XML_HEADERS } from '@/lib/sitemapXml';
import { listKnownModelKeys, MODELS_SITEMAP_CHUNK } from '@/lib/cams/modelDb';

/**
 * Sitemap INDEX — the only sitemap URL that gets advertised. Children are split by section so
 * Search Console reports indexing per content type (and mirrors the Yoast layout production ran,
 * which this domain's crawl history already knows).
 *
 * The models section is chunked (?page=N, 20k URLs each) because the registry outgrows a single
 * file; the chunk count comes from the same cached keys response the chunks themselves read.
 * An index may not list another index, so the chunks are registered here directly.
 */
export const dynamic = 'force-dynamic';

async function modelChunkPaths(): Promise<string[]> {
  if (!siteSettings.features.liveSex) return [];
  try {
    // Page 1 — the same cached response the first chunk renders from; `total` sizes the list.
    const { total } = await listKnownModelKeys(1);
    const chunks = Math.max(1, Math.ceil(total / MODELS_SITEMAP_CHUNK));
    return Array.from({ length: chunks }, (_, i) => `/models-sitemap.xml?page=${i + 1}`);
  } catch {
    // Registry unreachable: advertise the bare legacy URL rather than dropping the section.
    return ['/models-sitemap.xml'];
  }
}

export async function GET() {
  const children = [
    '/discounts-sitemap.xml',
    '/reviews-sitemap.xml',
    '/blog-sitemap.xml',
    '/pages-sitemap.xml',
    ...(siteSettings.features.liveSex ? ['/live-sex-sitemap.xml'] : []),
    ...(await modelChunkPaths()),
  ].map((p) => `${siteSettings.baseUrl}${p}`);

  return new Response(sitemapIndexXml(children), { headers: XML_HEADERS });
}
