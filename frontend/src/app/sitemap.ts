import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { siteSettings } from '@/lib/siteSettings';
import { routes } from '@/lib/routes';
import {
  getSitesForSitemap,
  getBundlesForSitemap,
  getSalesForSitemap,
  getCategoriesForSitemap,
  getArticlesForSitemap,
  getAuthorsForSitemap,
  getReviewsForSitemap,
  getPagesForSitemap,
  type SitemapSite,
  type SitemapBundle,
  type SitemapSale,
  type SitemapCategory,
  type SitemapArticle,
  type SitemapAuthor,
  type SitemapReview,
  type SitemapPage,
} from '@/lib/strapi';

export const dynamic = 'force-dynamic';

// Google's recommended max is 50k URLs per sitemap file
const PAGE_SIZE = 50_000;

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function localizedUrl(locale: string, path: string): string {
  return locale === routing.defaultLocale
    ? `${siteSettings.baseUrl}${path}`
    : `${siteSettings.baseUrl}/${locale}${path}`;
}

type WithLocalizations = { localizations: { locale: string }[] };

function buildAlternates(
  item: WithLocalizations,
  path: string,
): { languages: Record<string, string> } | undefined {
  const existingLocales = new Set(['en', ...item.localizations.map((l) => l.locale)]);
  const matched = routing.locales.filter((l) => existingLocales.has(l));
  if (matched.length <= 1) return undefined;
  return {
    languages: Object.fromEntries(matched.map((l) => [l, localizedUrl(l, path)])),
  };
}

// ---------------------------------------------------------------------------
// sitemap — single combined file
// ---------------------------------------------------------------------------

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [
    { data: sites },
    { data: bundles },
    { data: sales },
    { data: categories },
    { data: articles },
    { data: authors },
    { data: reviews },
    { data: pages },
  ] = await Promise.all([
    getSitesForSitemap(1, PAGE_SIZE),
    getBundlesForSitemap(1, PAGE_SIZE),
    getSalesForSitemap(1, PAGE_SIZE),
    getCategoriesForSitemap(1, PAGE_SIZE),
    getArticlesForSitemap(1, PAGE_SIZE),
    getAuthorsForSitemap(1, PAGE_SIZE),
    getReviewsForSitemap(1, PAGE_SIZE),
    getPagesForSitemap(1, PAGE_SIZE),
  ]);

  const staticPaths = [routes.home(), routes.blog(), routes.bundles(), routes.reviews()];
  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: localizedUrl('en', path),
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, localizedUrl(l, path)])),
    },
  }));

  const siteEntries: MetadataRoute.Sitemap = sites.map((item: SitemapSite) => {
    const path = routes.site(item.slug);
    return { url: localizedUrl('en', path), lastModified: item.updatedAt, alternates: buildAlternates(item, path) };
  });

  const bundleEntries: MetadataRoute.Sitemap = bundles.map((item: SitemapBundle) => {
    const path = routes.bundle(item.slug);
    return { url: localizedUrl('en', path), lastModified: item.updatedAt, alternates: buildAlternates(item, path) };
  });

  const saleEntries: MetadataRoute.Sitemap = sales.map((item: SitemapSale) => {
    const path = routes.sale(item.slug);
    return { url: localizedUrl('en', path), lastModified: item.updatedAt, alternates: buildAlternates(item, path) };
  });

  const categoryEntries: MetadataRoute.Sitemap = categories.map((item: SitemapCategory) => {
    const path = routes.category(item.slug);
    return { url: localizedUrl('en', path), lastModified: item.updatedAt, alternates: buildAlternates(item, path) };
  });

  const articleEntries: MetadataRoute.Sitemap = articles.map((item: SitemapArticle) => {
    const path = routes.blogArticle(item.postId ?? item.id, item.slug);
    return { url: localizedUrl('en', path), lastModified: item.updatedAt, alternates: buildAlternates(item, path) };
  });

  const authorEntries: MetadataRoute.Sitemap = authors.map((item: SitemapAuthor) => {
    const path = routes.blogAuthor(item.slug);
    return { url: localizedUrl('en', path), lastModified: item.updatedAt, alternates: buildAlternates(item, path) };
  });

  const reviewEntries: MetadataRoute.Sitemap = reviews
    .filter((item: SitemapReview) => item.site?.slug)
    .map((item: SitemapReview) => {
      const path = routes.review(item.site.slug);
      return { url: localizedUrl('en', path), lastModified: item.updatedAt, alternates: buildAlternates(item, path) };
    });

  const pageEntries: MetadataRoute.Sitemap = pages.map((item: SitemapPage) => {
    const path = routes.page(item.slug);
    return { url: localizedUrl('en', path), lastModified: item.updatedAt, alternates: buildAlternates(item, path) };
  });

  return [
    ...staticEntries,
    ...siteEntries,
    ...bundleEntries,
    ...saleEntries,
    ...categoryEntries,
    ...articleEntries,
    ...authorEntries,
    ...reviewEntries,
    ...pageEntries,
  ];
}
