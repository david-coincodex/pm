import {
  getArticlesForSitemap,
  getAuthorsForSitemap,
  type SitemapArticle,
  type SitemapAuthor,
} from '@/lib/strapi';
import { routes } from '@/lib/routes';
import { fetchAll, entry, staticEntry } from '@/lib/sitemapData';
import { urlsetXml, XML_HEADERS } from '@/lib/sitemapXml';

/** Blog listing, every article, and author pages. Pages only — no video/media entries. */
export const dynamic = 'force-dynamic';

export async function GET() {
  const [articles, authors] = await Promise.all([
    fetchAll<SitemapArticle>(getArticlesForSitemap),
    fetchAll<SitemapAuthor>(getAuthorsForSitemap),
  ]);

  const urls = [
    staticEntry(routes.blog()),
    // Editorial dates first, `updatedAt` only as a floor — updatedAt moves on ANY write (a date
    // backfill, a widget-id migration), which would announce lastmod=today for the whole archive.
    ...articles.map((a) =>
      entry(a, routes.blogArticle(a.postId ?? a.id, a.slug), a.modifiedDate ?? a.publishDate ?? a.updatedAt),
    ),
    ...authors.map((a) => entry(a, routes.blogAuthor(a.slug))),
  ];
  return new Response(urlsetXml(urls), { headers: XML_HEADERS });
}
