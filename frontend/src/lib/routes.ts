/**
 * Centralised app route definitions.
 *
 * All internal paths are defined here. Import and call these helpers instead
 * of hardcoding URL strings — change a path here and it propagates everywhere.
 *
 * The returned strings are passed to next-intl's <Link> (from @/i18n/navigation)
 * which automatically adds the locale prefix when needed.
 */

export const routes = {
  /** Homepage */
  home: () => '/' as const,

  /** Site detail page — e.g. /brazzers/ */
  site: (slug: string) => `/${slug}/` as const,

  /** Subsite detail page — e.g. /brazzers/brazzers-network/ */
  subsite: (siteSlug: string, subsiteSlug: string) => `/${siteSlug}/${subsiteSlug}/` as const,

  /** Offer redirect page — e.g. /offer/42/ */
  offer: (id: number | string) => `/offer/${id}/` as const,

  /** Bundles listing */
  bundles: () => '/bundles/' as const,

  /** Bundle detail page — e.g. /bundles/premium-paysites-pack/ */
  bundle: (slug: string) => `/bundles/${slug}/` as const,

  /** Category page — e.g. /best-ai-porn-sites/ */
  category: (slug: string) => `/best-${slug}-sites/` as const,

  /** Blog listing */
  blog: () => '/blog/' as const,

  /** Blog article — e.g. /blog/1/my-article-slug */
  blogArticle: (id: number | string, slug: string) => `/blog/${id}/${slug}` as const,

  /** Static CMS page — e.g. /page/about/ */
  page: (slug: string) => `/page/${slug}/` as const,

  /** Reviews listing */
  reviews: () => '/reviews/' as const,

  /** Review detail page — e.g. /reviews/brazzers/ */
  review: (siteSlug: string) => `/reviews/${siteSlug}/` as const,

  /** Sale landing page — e.g. /sale/black-friday/ */
  sale: (slug: string) => `/sale/${slug}/` as const,
};
