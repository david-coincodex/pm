import { getReviewsForSitemap, type SitemapReview } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import { fetchAll, entry, staticEntry } from '@/lib/sitemapData';
import { urlsetXml, XML_HEADERS } from '@/lib/sitemapXml';

/**
 * The /reviews/ listing plus all /reviews/<site-slug>/ pages.
 * A review with no site relation has no URL and is skipped.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const reviews = await fetchAll<SitemapReview>(getReviewsForSitemap);
  const urls = [
    staticEntry(routes.reviews()),
    ...reviews.filter((r) => r.site?.slug).map((r) => entry(r, routes.review(r.site.slug))),
  ];
  return new Response(urlsetXml(urls), { headers: XML_HEADERS });
}
