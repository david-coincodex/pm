/**
 * Centralised app route definitions.
 *
 * All internal paths are defined here. Import and call these helpers instead
 * of hardcoding URL strings — change a path here and it propagates everywhere.
 *
 * The returned strings are passed to next-intl's <Link> (from @/i18n/navigation)
 * which automatically adds the locale prefix when needed.
 */

import { siteSettings } from '@/lib/siteSettings';
import { camListPath } from '@/lib/cams/urls';
import { CAM_PROVIDER_SLUGS, type CamProvider } from '@/lib/cams/types';

export const routes = {
  /** Homepage */
  home: () => '/' as const,

  /** Site detail page — e.g. /discounts/brazzers/ */
  site: (slug: string) => `/discounts/${slug}/` as const,

  /** Subsite detail page — uses the same /discounts/ prefix as regular sites */
  subsite: (_siteSlug: string, subsiteSlug: string) => `/discounts/${subsiteSlug}/` as const,

  /** Offer redirect page — e.g. /offer/42/ */
  offer: (id: number | string) => `/offer/${id}/` as const,

  /** Bundles listing */
  bundles: () => '/bundles/' as const,

  /** Bundle detail page — e.g. /bundles/premium-paysites-pack/ */
  bundle: (slug: string) => `/bundles/${slug}/` as const,

  /** Category page — e.g. /best-ai-porn-sites/ */
  category: (slug: string) => `/best-${slug}-sites/` as const,

  /** All categories listing */
  categories: () => '/categories/' as const,

  /** Blog listing */
  blog: () => '/blog/' as const,

  /** Blog article — e.g. /blog/1/my-article-slug/ */
  blogArticle: (id: number | string, slug: string) => `/blog/${id}/${slug}/` as const,

  /** Blog author page — e.g. /blog/author/jane-doe/ */
  blogAuthor: (slug: string) => `/blog/author/${slug}/` as const,

  /** Static CMS page — e.g. /page/about/ */
  page: (slug: string) => `/page/${slug}/` as const,

  /** Reviews listing */
  reviews: () => '/reviews/' as const,

  /** Review detail page — e.g. /reviews/brazzers/ */
  review: (siteSlug: string) => `/reviews/${siteSlug}/` as const,

  /** Sale landing page — e.g. /sale/black-friday/ */
  sale: (slug: string) => `/sale/${slug}/` as const,

  /** Live cams hub */
  liveSex: () => '/live-sex/' as const,

  /**
   * Any live-cams listing URL — hub, category, sort and page all in the path.
   * See lib/cams/urls.ts for the grammar; use this instead of building the string.
   */
  camList: camListPath,

  /** Live cams category page 1 — e.g. /live-sex/big-tits/, /live-sex/chaturbate/ */
  camCategory: (slug: string) => camListPath({ categorySlug: slug }),

  /** Live cam model page — nested under the provider's category slug, e.g.
   * /live-sex/chaturbate/ladysweet_x/. */
  camModel: (provider: string, username: string) =>
    `/live-sex/${CAM_PROVIDER_SLUGS[provider as CamProvider] ?? provider}/${username}/` as const,

  /** Server-counted affiliate redirect for a cam room (robots-disallowed + X-Robots-Tag).
   * Full provider name in the URL — short ids (cb/bc) never appear in URLs. */
  camOut: (provider: string, username: string) =>
    `/out/model/${CAM_PROVIDER_SLUGS[provider as CamProvider] ?? provider}/${username}/` as const,

  /** Where nav/footer "Live Sex" points: the hub when the feature is on, the deals category until then */
  liveSexNav: () => (siteSettings.features.liveSex ? routes.liveSex() : routes.category('live-sex')),

  /** Account: login */
  login: () => '/account/login/' as const,

  /** Account: register */
  register: () => '/account/register/' as const,

  /** Account: favorites */
  favorites: () => '/account/favorites/' as const,
};
