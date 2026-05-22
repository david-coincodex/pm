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

  /** Discount detail page (legacy /discount/ route) — e.g. /discount/brazzers/ */
  discount: (slug: string) => `/discount/${slug}/` as const,

  /** All discounts listing */
  discounts: () => '/discount/' as const,

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
};
