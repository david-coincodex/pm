import { cache } from 'react';

// Public URL — shown in the UI and used by the browser for client-side calls
export const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1339';

// Internal URL — used by Next.js Server Components when running inside Docker
// (e.g. http://backend:1339). Falls back to the public URL outside Docker.
const STRAPI_FETCH_URL = process.env.STRAPI_INTERNAL_URL ?? STRAPI_URL;

// Cloudflare Access service-token headers, used only for local dev pointed at a
// Cloudflare-Access-gated Strapi (e.g. cms-staging.pornmode.com). No-op in
// production and normal local dev, where these env vars are unset. Server-side
// only — never expose the secret to the browser.
function cfAccessHeaders(): Record<string, string> {
  const id = process.env.CF_ACCESS_CLIENT_ID;
  const secret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (!id || !secret) return {};
  return { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret };
}

export type StrapiResponse<T> = {
  data: T;
  meta: {
    pagination?: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
};

export type StrapiError = {
  data: null;
  error: {
    status: number;
    name: string;
    message: string;
  };
};

export type StrapiImageFormat = {
  url: string;
  width: number;
  height: number;
};

export type StrapiMedia = {
  id: number;
  documentId: string;
  url: string;
  alternativeText: string | null;
  width: number;
  height: number;
  formats?: {
    thumbnail?: StrapiImageFormat;
    small?: StrapiImageFormat;
    medium?: StrapiImageFormat;
    large?: StrapiImageFormat;
  };
};

export type Platform = {
  id: number;
  documentId: string;
  name: string;
  website: string | null;
  description: string | null;
  logo: StrapiMedia | null;
  paymentMethods: Array<{ method: string }> | null;
};

/** A single FAQ entry from the shared `faqs` component. */
export type Faq = {
  id: number;
  question: string;
  answer: string;
};

export type Site = {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  url: string;
  isActive: boolean;
  short_description: string | null;
  description: Record<string, unknown>[] | null;
  siteType: 'paysite' | 'camsite' | 'datingsite' | 'tubesite';
  logo: StrapiMedia | null;
  cover_image: StrapiMedia | null;
  included: string | null;
  gallery: StrapiMedia[];
  offers: Offer[];
  parent_site: Site | null;
  child_sites: Site[];
  platform: Platform | null;
  faqs?: Faq[];
};

/**
 * Scalar `Site` fields that list/card views actually render.
 *
 * Without an explicit `fields` list Strapi returns every scalar column, and two of
 * them are enormous and unused by the frontend: `scrapedReviews` (~24 KB per site)
 * and `externalContext` (~3 KB per site). On the 12-card homepage that alone was
 * ~90% of a 268 KB response. `populate` does not gate scalars — only `fields` does.
 *
 * Safe to append to queries that use array-style `populate[0]=…`: `fields` narrows
 * only top-level scalars and leaves populated relations untouched. Do NOT mix
 * array-style `populate[n]=x` with object-style `populate[x][fields]=…` in the same
 * query — Strapi silently drops the array-style entries (200, no error).
 *
 * Detail fetchers deliberately omit this: they render `description`/`included`.
 */
const SITE_CARD_FIELDS = 'fields=name,slug,url,isActive,short_description,siteType';

/** The scalar list from SITE_CARD_FIELDS, for use inside a nested populate. */
const SITE_CARD_FIELD_LIST = 'name,slug,url,isActive,short_description,siteType';

/**
 * Narrow a *nested* site relation to card shape, e.g. `sites` on a bundle or
 * `site` on a featured/review row. Array-style `populate[n]=sites.logo` cannot
 * narrow the nested scalars, so these queries have to use object-style throughout.
 *
 * Object-style at the parent level composes fine with array-style *inside* the
 * nested `populate` (different nesting levels, so the silent-drop footgun in
 * SITE_CARD_FIELDS does not apply here) — verified against local Strapi.
 */
function nestedSiteCard(key: string, extraPopulate: string[] = []): string {
  const relations = ['logo', 'cover_image', 'offers', ...extraPopulate];
  return [
    `populate[${key}][fields]=${SITE_CARD_FIELD_LIST}`,
    ...relations.map((r, i) => `populate[${key}][populate][${i}]=${r}`),
  ].join('&');
}

/** Resolve a Strapi media URL to an absolute URL */
export function strapiMediaUrl(media: StrapiMedia): string {
  if (media.url.startsWith('http')) return media.url;
  return `${STRAPI_URL}${media.url}`;
}

type FetchOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | null;
  token?: string;
};

/**
 * Revalidate window used when a call site does not ask for one.
 *
 * Content freshness does not depend on this being short: a Strapi webhook hits
 * /api/revalidate on publish and busts the `strapi` tag, so edits appear
 * immediately rather than up to one window later.
 */
const DEFAULT_REVALIDATE = 300;

type StrapiFetchOptions = Omit<RequestInit, 'body' | 'next'> & {
  body?: BodyInit | null;
  token?: string;
  next?: NextFetchRequestConfig;
};

export async function strapiGet<T>(
  path: string,
  options: StrapiFetchOptions = {}
): Promise<StrapiResponse<T>> {
  const { token, headers = {}, next, ...rest } = options;

  // "/sites?populate…" -> "sites". Used to tag each response by collection so a
  // webhook can invalidate selectively later; today /api/revalidate busts 'strapi'.
  const collection = path.replace(/^\//, '').split(/[?/]/)[0];

  const res = await fetch(`${STRAPI_FETCH_URL}/api${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...cfAccessHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string>),
    },
    // `next` was previously hardcoded *after* spreading the caller's options, so
    // every per-call revalidate value in this file was silently discarded and
    // everything ran at 60s. `??` (not `||`) so an explicit 0/false survives.
    next: {
      revalidate: next?.revalidate ?? DEFAULT_REVALIDATE,
      tags: ['strapi', `strapi:${collection}`, ...(next?.tags ?? [])],
    },
  });

  if (!res.ok) {
    const error: StrapiError = await res.json().catch(() => ({
      data: null,
      error: { status: res.status, name: res.statusText, message: res.statusText },
    }));
    throw new Error(
      error.error?.message ?? `Strapi request failed: ${res.status}`
    );
  }

  return res.json() as Promise<StrapiResponse<T>>;
}

export async function strapiPost<T>(
  path: string,
  body: unknown,
  options: FetchOptions = {}
): Promise<StrapiResponse<T>> {
  const { token, headers = {}, ...rest } = options;

  const res = await fetch(`${STRAPI_FETCH_URL}/api${path}`, {
    method: 'POST',
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...cfAccessHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string>),
    },
    body: JSON.stringify({ data: body }),
  });

  if (!res.ok) {
    const error: StrapiError = await res.json().catch(() => ({
      data: null,
      error: { status: res.status, name: res.statusText, message: res.statusText },
    }));
    throw new Error(
      error.error?.message ?? `Strapi request failed: ${res.status}`
    );
  }

  return res.json() as Promise<StrapiResponse<T>>;
}

/** Ping the Strapi health endpoint. Uses the internal Docker URL when available. */
export async function strapiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${STRAPI_FETCH_URL}/_health`, {
      headers: cfAccessHeaders(),
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type Category = {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  description: string | null;
  intro: string | null;
  content: string | null;
  cover_image: StrapiMedia | null;
  sites: Site[];
  faqs?: Faq[];
};

/** Fetch a single category by slug with up to `limit` of its sites (with offers). */
export async function getCategoryWithSites(slug: string, limit = 3): Promise<Category | null> {
  const res = await strapiGet<Category[]>(
    `/categories?${nestedSiteCard('sites')}&filters[slug][$eq]=${encodeURIComponent(slug)}&pagination[pageSize]=1`,
    { next: { revalidate: 300 } }
  );
  const cat = res.data[0] ?? null;
  if (!cat) return null;
  // Limit sites and only keep those with active offers
  cat.sites = (cat.sites ?? [])
    .filter((s) => (s.offers ?? []).some((o) => o.isActive))
    .slice(0, limit);
  return cat;
}

export type Bundle = {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  description: string | null;
  content: Record<string, unknown>[] | null;
  included: string | null;
  gallery: StrapiMedia[];
  cover_image: StrapiMedia | null;
  sites: Site[];
  offers: Offer[];
};

/**
 * Bundle scalars a card renders. Drops `content` (the rich-text body, detail-page only).
 */
const BUNDLE_CARD_FIELDS = 'fields=name,slug,description,included';

/** Fetch up to `limit` published bundles with their sites + offers. */
export async function getPublishedBundles(limit = 3): Promise<Bundle[]> {
  const res = await strapiGet<Bundle[]>(
    `/bundles?${BUNDLE_CARD_FIELDS}&${nestedSiteCard('sites')}&populate[offers]=true&sort=createdAt:desc&pagination[pageSize]=${limit}`,
    { next: { revalidate: 300 } }
  );
  return res.data;
}

/** Fetch up to `limit` bundles that contain the given site slug. */
export async function getBundlesForSite(siteSlug: string, limit = 3): Promise<Bundle[]> {
  const res = await strapiGet<Bundle[]>(
    `/bundles?filters[sites][slug][$eq]=${encodeURIComponent(siteSlug)}&${BUNDLE_CARD_FIELDS}&${nestedSiteCard('sites')}&populate[offers]=true&sort=createdAt:desc&pagination[pageSize]=${limit}`,
    { next: { revalidate: 300 } }
  );
  return res.data;
}

/** Fetch a paginated list of published bundles with their sites + offers. */
export async function getBundlesPaginated(
  page = 1,
  pageSize = 12,
): Promise<{ bundles: Bundle[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<Bundle[]>(
    `/bundles?${BUNDLE_CARD_FIELDS}&${nestedSiteCard('sites')}&populate[offers]=true&sort=createdAt:desc&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 300 } }
  );
  return {
    bundles: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/**
 * Full bundle-detail shape: keeps the rich-text `content`, `gallery` and
 * `cover_image`, but narrows the nested `sites` to card shape — the detail page
 * renders them as tiles, and their un-narrowed scalars (scrapedReviews et al)
 * were ~70% of a 113 KB response.
 */
const BUNDLE_DETAIL_QUERY = [
  'fields=name,slug,description,content,included',
  'populate[cover_image]=true',
  'populate[gallery]=true',
  'populate[offers]=true',
].join('&');

/** Fetch a single bundle by slug with sites, their offers, and the bundle's own offers. Falls back to 'en' if no translation exists. */
export async function getBundleBySlug(slug: string, locale = 'en'): Promise<Bundle | null> {
  const res = await strapiGet<Bundle[]>(
    `/bundles?${BUNDLE_DETAIL_QUERY}&${nestedSiteCard('sites')}&filters[slug][$eq]=${encodeURIComponent(slug)}&locale=${encodeURIComponent(locale)}`,
    { next: { revalidate: 60 } }
  );
  if (res.data[0]) return res.data[0];
  if (locale !== 'en') {
    const fallback = await strapiGet<Bundle[]>(
      `/bundles?${BUNDLE_DETAIL_QUERY}&${nestedSiteCard('sites')}&filters[slug][$eq]=${encodeURIComponent(slug)}&locale=en`,
      { next: { revalidate: 60 } }
    );
    return fallback.data[0] ?? null;
  }
  return null;
}

export type Offer = {
  id: number;
  documentId: string;
  offerKind: 'subscription' | 'credits';
  offerType: 'trial' | 'monthly' | 'quarterly' | 'yearly' | 'lifetime' | 'credits' | null;
  credits: number | null;
  price: number;
  full_price: number | null;
  affiliateLink: string;
  allowsDownloads: boolean;
  priority: number;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
};

/** Returns discount percentage (0–100) or null if no discount applies. */
export function getDiscountPercent(offer: Pick<Offer, 'price' | 'full_price'>): number | null {
  if (!offer.full_price || offer.full_price <= offer.price) return null;
  return Math.round(((offer.full_price - offer.price) / offer.full_price) * 100);
}

/** Returns the highest discount percentage across a list of offers, or null if none. */
export function getMaxDiscountPercent(offers: Pick<Offer, 'price' | 'full_price'>[]): number | null {
  let max: number | null = null;
  for (const offer of offers) {
    const d = getDiscountPercent(offer);
    if (d !== null && (max === null || d > max)) max = d;
  }
  return max;
}

export type Featured = {
  id: number;
  documentId: string;
  name: string;
  site: Site;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  priority: number;
};

/** Fetch active sites with at least one lifetime offer, max 4, sorted by name. */
export async function getLifetimeDeals(limit = 4): Promise<Site[]> {
  const res = await strapiGet<Site[]>(
    `/sites?${SITE_CARD_FIELDS}&populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[isActive][$eq]=true&filters[offers][isActive][$eq]=true&filters[offers][offerType][$eq]=lifetime&filters[parent_site][$null]=true&sort=name:asc&pagination[pageSize]=${limit}`,
  );
  return res.data;
}

/** Fetch active sites by siteType with at least one active offer. */
export async function getSitesBySiteType(
  siteType: Site['siteType'],
  limit = 12,
): Promise<Site[]> {
  const res = await strapiGet<Site[]>(
    `/sites?${SITE_CARD_FIELDS}&populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[isActive][$eq]=true&filters[siteType][$eq]=${encodeURIComponent(siteType)}&filters[offers][isActive][$eq]=true&filters[parent_site][$null]=true&sort=name:asc&pagination[pageSize]=${limit}`,
    { next: { revalidate: 300 } }
  );
  return res.data;
}

/**
 * Fetch active featured deals with their sites + offers, sorted by priority desc.
 * React.cache'd — read by the homepage and by /api/featured.
 */
export const getFeaturedDeals = cache(async (): Promise<Featured[]> => {
  const now = new Date().toISOString();
  const res = await strapiGet<Featured[]>(
    `/featureds?fields=name,isActive,priority,validFrom,validTo&${nestedSiteCard('site')}&filters[isActive][$eq]=true&filters[$or][0][validFrom][$null]=true&filters[$or][0][validTo][$null]=true&filters[$or][1][validFrom][$lte]=${now}&filters[$or][1][validTo][$gte]=${now}&sort=priority:desc&pagination[pageSize]=10`,
    { next: { revalidate: 60 } }
  );
  return res.data;
});

export type StrapiPaginationMeta = {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
};

/** Fetch a page of active sites with offers, returns data + pagination metadata. */
export async function getSitesWithDealsPaginated(
  page = 1,
  pageSize = 12,
): Promise<{ sites: Site[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<Site[]>(
    `/sites?${SITE_CARD_FIELDS}&populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[isActive][$eq]=true&filters[offers][isActive][$eq]=true&filters[parent_site][$null]=true&sort=name:asc&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
  );
  return {
    sites: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/** Fetch top N active sites with offers, optionally excluding a slug. */
export async function getTopDeals(limit = 4, excludeSlug?: string): Promise<Site[]> {
  const res = await strapiGet<Site[]>(
    `/sites?${SITE_CARD_FIELDS}&populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[isActive][$eq]=true&filters[offers][isActive][$eq]=true&filters[parent_site][$null]=true&sort=createdAt:desc&pagination[pageSize]=${limit + 1}`,
    { next: { revalidate: 300 } }
  );
  const all = res.data.filter((s) => s.slug !== excludeSlug);
  return all.slice(0, limit);
}

/**
 * Full site-detail shape for /discounts/[slug].
 *
 * Object-style throughout (required — see nestedSiteCard). Keeps `description`,
 * `included`, `gallery`, `faqs`, `platform.paymentMethods` and the parent/child
 * relations the page renders, while dropping `scrapedReviews`/`externalContext`
 * at every level. On /discounts/bangbros (48 child sites) that is 854 KB -> 74 KB.
 *
 * `child_sites` is card-shaped: SubsiteGrid is a client component, so anything
 * populated here is also serialized into the RSC payload.
 */
const SITE_DETAIL_QUERY = [
  'fields=name,slug,url,isActive,short_description,description,siteType,included',
  'populate[logo]=true',
  'populate[cover_image]=true',
  'populate[offers]=true',
  'populate[gallery]=true',
  'populate[faqs]=true',
  `populate[child_sites][fields]=${SITE_CARD_FIELD_LIST}`,
  'populate[child_sites][populate][logo]=true',
  'populate[child_sites][populate][cover_image]=true',
  'populate[platform][populate][logo]=true',
  'populate[platform][populate][paymentMethods]=true',
  // parent_site is the pricing/"includes" source when a site has one
  // (discounts/[slug] uses `site.parent_site ?? site`), so it needs `included`.
  `populate[parent_site][fields]=${SITE_CARD_FIELD_LIST},included,description`,
  'populate[parent_site][populate][offers]=true',
  'populate[parent_site][populate][platform][populate][logo]=true',
  'populate[parent_site][populate][platform][populate][paymentMethods]=true',
].join('&');

/** Fetch the active site by slug with its offers and child sites. Falls back to 'en' if no translation exists. */
export async function getDealBySiteSlug(slug: string, locale = 'en'): Promise<Site | null> {
  const res = await strapiGet<Site[]>(
    `/sites?${SITE_DETAIL_QUERY}&filters[slug][$eq]=${encodeURIComponent(slug)}&filters[isActive][$eq]=true&locale=${encodeURIComponent(locale)}`,
    { next: { revalidate: 60 } }
  );
  if (res.data[0]) return res.data[0];
  if (locale !== 'en') {
    const fallback = await strapiGet<Site[]>(
      `/sites?${SITE_DETAIL_QUERY}&filters[slug][$eq]=${encodeURIComponent(slug)}&filters[isActive][$eq]=true&locale=en`,
      { next: { revalidate: 60 } }
    );
    return fallback.data[0] ?? null;
  }
  return null;
}

export async function getSiteById(id: number): Promise<Site | null> {
  const res = await strapiGet<Site[]>(
    `/sites?${SITE_CARD_FIELDS}&populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[id][$eq]=${id}&filters[isActive][$eq]=true&pagination[pageSize]=1`,
    { next: { revalidate: 60 } }
  );
  return res.data[0] ?? null;
}

/** Fetch a single offer by numeric id, populated with its site. */
export async function getOfferById(id: number): Promise<(Offer & { site: Site }) | null> {
  const res = await strapiGet<(Offer & { site: Site })[]>(
    `/offers?${nestedSiteCard('site')}&filters[id][$eq]=${id}&filters[isActive][$eq]=true`,
    { next: { revalidate: 60 } }
  );
  return res.data[0] ?? null;
}

/** Fetch all categories (for static path generation). */
export async function getAllCategories(): Promise<Category[]> {
  const res = await strapiGet<Category[]>(
    '/categories?pagination[pageSize]=100',
    { next: { revalidate: 3600 } }
  );
  return res.data;
}

/** Fetch all published categories with cover images and their site counts. */
export async function getCategoriesGrid(): Promise<(Category & { siteCount: number })[]> {
  const categoriesPromise = strapiGet<Category[]>(
    '/categories?fields=name,slug&populate[0]=cover_image&pagination[pageSize]=100&sort=name:asc',
    { next: { revalidate: 300 } }
  );

  type SiteCategoryRef = Pick<Category, 'documentId'>;
  type SiteCategoryCountRow = {
    categories: SiteCategoryRef[];
  };

  const countPage = (page: number) =>
    strapiGet<SiteCategoryCountRow[]>(
      `/sites?fields[0]=id&populate[categories][fields][0]=documentId&filters[isActive][$eq]=true&pagination[page]=${page}&pagination[pageSize]=100`,
      { next: { revalidate: 300 } }
    );

  // Page 1 tells us the page count; fetch the remainder concurrently rather than
  // walking them one at a time (300+ sites = 4 serial round trips before).
  const firstCountPage = await countPage(1);
  const pageCount = firstCountPage.meta.pagination?.pageCount ?? 1;
  const [restCountPages, categoriesRes] = await Promise.all([
    Promise.all(
      Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => countPage(i + 2))
    ),
    categoriesPromise,
  ]);

  const siteCountByCategory = new Map<string, number>();
  for (const res of [firstCountPage, ...restCountPages]) {
    for (const site of res.data) {
      for (const category of site.categories ?? []) {
        siteCountByCategory.set(
          category.documentId,
          (siteCountByCategory.get(category.documentId) ?? 0) + 1
        );
      }
    }
  }

  return categoriesRes.data.map((cat) => ({
    ...cat,
    siteCount: siteCountByCategory.get(cat.documentId) ?? 0,
    sites: [],
  }));
}

/** Fetch a category by slug (metadata only, no sites). */
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const res = await strapiGet<Category[]>(
    `/categories?populate[0]=faqs&filters[slug][$eq]=${encodeURIComponent(slug)}&pagination[pageSize]=1`,
    { next: { revalidate: 300 } }
  );
  return res.data[0] ?? null;
}

/** Fetch a paginated list of active sites belonging to a category ID. */
export async function getSitesByCategoryId(
  categoryId: number,
  page = 1,
  pageSize = 12,
): Promise<{ sites: Site[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<Site[]>(
    `/sites?${SITE_CARD_FIELDS}&populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[isActive][$eq]=true&filters[categories][id][$eq]=${categoryId}&sort=name:asc&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 300 } }
  );
  return {
    sites: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/** Fetch a paginated list of active sites belonging to a category slug. */
export async function getSitesByCategorySlug(
  categorySlug: string,
  page = 1,
  pageSize = 12,
): Promise<{ sites: Site[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<Site[]>(
    `/sites?${SITE_CARD_FIELDS}&populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[isActive][$eq]=true&filters[categories][slug][$eq]=${encodeURIComponent(categorySlug)}&sort=name:asc&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 300 } }
  );
  return {
    sites: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/** Search sites by name or short_description (includes subsites). Runs server-side (no cache). */
export async function searchSites(query: string): Promise<Site[]> {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];
  const res = await strapiGet<Site[]>(
    `/sites?${SITE_CARD_FIELDS}&populate[logo]=true&populate[cover_image]=true&populate[offers]=true&populate[parent_site][fields]=slug,name&populate[parent_site][populate][offers]=true&filters[isActive][$eq]=true&filters[$or][0][name][$containsi]=${q}&filters[$or][1][short_description][$containsi]=${q}&sort=name:asc&pagination[pageSize]=10`,
    { next: { revalidate: 0 } }
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// Blog types
// ---------------------------------------------------------------------------

export type ArticleAuthor = {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  bio: string | null;
  avatar: StrapiMedia | null;
};

export type ArticleCategory = {
  id: number;
  documentId: string;
  name: string;
  slug: string;
};

export type ArticleTag = {
  id: number;
  documentId: string;
  name: string;
  slug: string;
};

export type Article = {
  id: number;
  documentId: string;
  metaTitle: string | null;
  title: string;
  slug: string;
  description: string | null;
  content: Record<string, unknown>[] | null;
  coverImage: StrapiMedia | null;
  categories: ArticleCategory[];
  tags: ArticleTag[];
  author: ArticleAuthor | null;
  publishDate: string | null;
  modifiedDate: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  locale: string;
  faqs?: Faq[];
};

const ARTICLE_POPULATE =
  'populate[0]=coverImage&populate[1]=categories&populate[2]=tags&populate[3]=author&populate[4]=author.avatar&populate[5]=faqs';

/**
 * Every `Article` scalar except `content` — the full rich-text body, ~10 KB per row,
 * which only the article detail page renders. Listing 8 articles on the homepage was
 * shipping ~80 KB of body copy nobody reads. Append to list queries only; the detail
 * fetcher (`getArticleById`) deliberately omits this so it still gets `content`.
 */
const ARTICLE_CARD_FIELDS =
  'fields=metaTitle,title,slug,description,publishDate,modifiedDate,publishedAt,createdAt,updatedAt,locale';

/**
 * Relations a card needs. Same as ARTICLE_POPULATE minus `faqs`, which is ~11 KB
 * across 8 rows and is only rendered by the article detail page.
 */
const ARTICLE_CARD_POPULATE =
  'populate[0]=coverImage&populate[1]=categories&populate[2]=tags&populate[3]=author&populate[4]=author.avatar';

/** Scheduling filter: hide articles whose publishDate is in the future. */
function articleScheduleFilter(): string {
  const now = new Date().toISOString();
  return `filters[$and][0][$or][0][publishDate][$lte]=${now}&filters[$and][0][$or][1][publishDate][$null]=true`;
}

/** Fetch a paginated list of published articles for a locale, newest first. */
export async function getArticlesPaginated(
  locale: string,
  page = 1,
  pageSize = 12
): Promise<{ data: Article[]; pagination: NonNullable<StrapiResponse<Article[]>['meta']['pagination']> }> {
  const res = await strapiGet<Article[]>(
    `/articles?${ARTICLE_CARD_FIELDS}&${ARTICLE_CARD_POPULATE}&filters[publishedAt][$notNull]=true&${articleScheduleFilter()}&locale=${encodeURIComponent(locale)}&sort=publishedAt:desc&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 300 } }
  );
  const pagination = res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length };
  return { data: res.data, pagination };
}

/** Fetch all author slugs (for static params generation). */
export async function getAllAuthorSlugs(): Promise<string[]> {
  const res = await strapiGet<ArticleAuthor[]>(
    `/authors?fields[0]=slug&pagination[pageSize]=100`,
    { next: { revalidate: 3600 } }
  );
  return res.data.map((a) => a.slug);
}

/** Fetch a single author by slug with avatar populated. Returns null if not found. */
export async function getAuthorBySlug(slug: string): Promise<ArticleAuthor | null> {
  const res = await strapiGet<ArticleAuthor[]>(
    `/authors?populate[0]=avatar&filters[slug][$eq]=${encodeURIComponent(slug)}&pagination[pageSize]=1`,
    { next: { revalidate: 300 } }
  );
  return res.data[0] ?? null;
}

/** Fetch a paginated list of published articles by author slug for a locale, newest first. */
export async function getArticlesByAuthor(
  authorSlug: string,
  locale: string,
  page = 1,
  pageSize = 12
): Promise<{ data: Article[]; pagination: NonNullable<StrapiResponse<Article[]>['meta']['pagination']> }> {
  const res = await strapiGet<Article[]>(
    `/articles?${ARTICLE_CARD_FIELDS}&${ARTICLE_CARD_POPULATE}&filters[publishedAt][$notNull]=true&${articleScheduleFilter()}&filters[author][slug][$eq]=${encodeURIComponent(authorSlug)}&locale=${encodeURIComponent(locale)}&sort=publishDate:desc&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 300 } }
  );
  const pagination = res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length };
  return { data: res.data, pagination };
}

/** Fetch the latest N published articles for a locale. */
export async function getLatestArticles(locale: string, limit = 8): Promise<Article[]> {
  const res = await strapiGet<Article[]>(
    `/articles?${ARTICLE_CARD_FIELDS}&${ARTICLE_CARD_POPULATE}&filters[publishedAt][$notNull]=true&${articleScheduleFilter()}&locale=${encodeURIComponent(locale)}&sort=publishedAt:desc&pagination[pageSize]=${limit}`,
    { next: { revalidate: 300 } }
  );
  return res.data;
}

/** Fetch a single article by numeric id and slug. Returns null if not found. */
export async function getArticleById(id: number, locale: string): Promise<Article | null> {
  const res = await strapiGet<Article[]>(
    `/articles?${ARTICLE_POPULATE}&filters[id][$eq]=${id}&filters[publishedAt][$notNull]=true&${articleScheduleFilter()}&locale=${encodeURIComponent(locale)}`,
    { next: { revalidate: 60 } }
  );
  return res.data[0] ?? null;
}

export type Page = {
  id: number;
  documentId: string;
  title: string;
  slug: string;
  h1: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  content: Record<string, unknown>[] | null;
};

/** Fetch a published CMS page by slug and locale. Falls back to default locale if no translation exists. */
export async function getPageBySlug(slug: string, locale = 'en'): Promise<Page | null> {
  const res = await strapiGet<Page[]>(
    `/pages?filters[slug][$eq]=${encodeURIComponent(slug)}&filters[publishedAt][$notNull]=true&locale=${encodeURIComponent(locale)}`,
    { next: { revalidate: 3600 } }
  );
  if (res.data[0]) return res.data[0];
  // Fall back to default locale if no translation found
  if (locale !== 'en') {
    const fallback = await strapiGet<Page[]>(
      `/pages?filters[slug][$eq]=${encodeURIComponent(slug)}&filters[publishedAt][$notNull]=true&locale=en`,
      { next: { revalidate: 3600 } }
    );
    return fallback.data[0] ?? null;
  }
  return null;
}

export type PaysiteScores = {
  contentQuality: number | null;
  contentAmount: number | null;
  value: number | null;
  updates: number | null;
  exclusivity: number | null;
  features: number | null;
  downloads: number | null;
  streaming: number | null;
  mobileExperience: number | null;
};

export type CamsiteScores = {
  modelVariety: number | null;
  streamQuality: number | null;
  features: number | null;
  value: number | null;
  interactivity: number | null;
  mobileExperience: number | null;
  privacy: number | null;
  privateShows: number | null;
};

export type Review = {
  id: number;
  documentId: string;
  titleExtra: string | null;
  description: string | null;
  content: Record<string, unknown>[] | null;
  overallScore: number | null;
  paysiteScores: PaysiteScores | null;
  camsiteScores: CamsiteScores | null;
  site: Site;
  author: ArticleAuthor | null;
  publishDate: string | null;
  modifiedDate: string | null;
  publishedAt: string | null;
  locale: string;
  faqs?: Faq[];
};

/**
 * Review listing shape. Drops the rich-text `content`, `faqs`, `site.gallery` and
 * `site.platform` — none of which SiteReviewCard renders — and narrows the nested
 * site to card shape. The /reviews listing was 1.38 MB for 24 rows.
 *
 * Object-style throughout: every populate entry at a given level must match style,
 * or Strapi silently drops the array-style ones.
 */
const REVIEW_CARD_FIELDS =
  'fields=titleExtra,description,overallScore,publishDate,modifiedDate,publishedAt,locale';
const REVIEW_CARD_POPULATE = [
  nestedSiteCard('site'),
  'populate[author][populate][0]=avatar',
  'populate[paysiteScores]=true',
  'populate[camsiteScores]=true',
].join('&');

/** Full shape for the review detail page (keeps content, faqs, gallery, platform). */
const REVIEW_POPULATE =
  'populate[0]=site&populate[1]=site.logo&populate[2]=site.cover_image&populate[3]=author&populate[4]=author.avatar&populate[5]=paysiteScores&populate[6]=camsiteScores&populate[7]=site.gallery&populate[8]=site.offers&populate[9]=site.platform&populate[10]=site.platform.paymentMethods&populate[11]=faqs';

/** Fetch all published reviews for a locale, newest first. */
export async function getReviews(locale: string, limit = 100): Promise<Review[]> {
  const res = await strapiGet<Review[]>(
    `/reviews?${REVIEW_CARD_FIELDS}&${REVIEW_CARD_POPULATE}&filters[publishedAt][$notNull]=true&locale=${encodeURIComponent(locale)}&sort=publishDate:desc&pagination[pageSize]=${limit}`,
    { next: { revalidate: 300 } }
  );
  return res.data;
}

/** Fetch a paginated list of published reviews for a locale, highest score first. */
export async function getReviewsPaginated(
  locale: string,
  page = 1,
  pageSize = 24
): Promise<{ data: Review[]; pagination: NonNullable<StrapiResponse<Review[]>['meta']['pagination']> }> {
  const res = await strapiGet<Review[]>(
    `/reviews?${REVIEW_CARD_FIELDS}&${REVIEW_CARD_POPULATE}&filters[publishedAt][$notNull]=true&locale=${encodeURIComponent(locale)}&sort[0]=overallScore:desc&sort[1]=publishDate:desc&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 300 } }
  );
  const pagination = res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length };
  return { data: res.data, pagination };
}

/** Fetch the latest N published reviews by author slug for a locale. */
export async function getReviewsByAuthor(authorSlug: string, locale: string, limit = 3): Promise<Review[]> {
  const res = await strapiGet<Review[]>(
    `/reviews?${REVIEW_CARD_FIELDS}&${REVIEW_CARD_POPULATE}&filters[publishedAt][$notNull]=true&filters[author][slug][$eq]=${encodeURIComponent(authorSlug)}&locale=${encodeURIComponent(locale)}&sort=publishDate:desc&pagination[pageSize]=${limit}`,
    { next: { revalidate: 300 } }
  );
  return res.data;
}

/** Fetch a single published review by site slug + locale. Falls back to 'en' if no translation. */
export async function getReviewBySiteSlug(siteSlug: string, locale: string): Promise<Review | null> {
  const res = await strapiGet<Review[]>(
    `/reviews?${REVIEW_POPULATE}&filters[site][slug][$eq]=${encodeURIComponent(siteSlug)}&filters[publishedAt][$notNull]=true&locale=${encodeURIComponent(locale)}`,
    { next: { revalidate: 300 } }
  );
  if (res.data[0]) return res.data[0];
  if (locale !== 'en') {
    const fallback = await strapiGet<Review[]>(
      `/reviews?${REVIEW_POPULATE}&filters[site][slug][$eq]=${encodeURIComponent(siteSlug)}&filters[publishedAt][$notNull]=true&locale=en`,
      { next: { revalidate: 300 } }
    );
    return fallback.data[0] ?? null;
  }
  return null;
}

// ─── Sale ────────────────────────────────────────────────────────────────────

export type SaleBadgeIcon = 'fire' | 'tag' | 'bolt' | 'star' | 'gift' | 'percent';

export type Sale = {
  id: number;
  documentId: string;
  title: string;
  slug: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  navLabel: string;
  themeColor: string;
  badgeLabel: string | null;
  badgeIcon: SaleBadgeIcon | null;
  badgeImage: StrapiMedia | null;
  featuredSites: Site[];
  sites: Site[];
  bundles: Bundle[];
  content: Record<string, unknown>[] | null;
  metaTitle: string | null;
  metaDescription: string | null;
  faqs?: Faq[];
};

// Nested sites are narrowed to card shape at every level — a live sale references
// many sites, and their un-narrowed scalars (scrapedReviews et al) made this a
// 967 KB response for one Black Friday sale (44 KB narrowed).
const SALE_POPULATE =
  'populate[badgeImage]=true' +
  '&populate[faqs]=true' +
  `&${nestedSiteCard('featuredSites')}` +
  `&${nestedSiteCard('sites')}` +
  '&populate[bundles][fields]=name,slug,description,included' +
  `&populate[bundles][populate][sites][fields]=${SITE_CARD_FIELD_LIST}` +
  '&populate[bundles][populate][sites][populate][logo]=true&populate[bundles][populate][sites][populate][cover_image]=true&populate[bundles][populate][sites][populate][offers]=true&populate[bundles][populate][offers]=true';

/** Fetch the currently active (published) sale, if any. Includes badge info and site IDs for card overlays. */
/**
 * Wrapped in React.cache: SiteCard calls this per card (~35x on the homepage), plus
 * Header, SidebarCategorySites and SiteCardInline. Next's fetch memoization already
 * collapses the HTTP call, but `.json()` still ran on a fresh clone every time — this
 * memoizes the parsed, post-processed result (including the siteIds dedup) per request.
 */
export const getActiveSale = cache(async (): Promise<Pick<Sale, 'id' | 'documentId' | 'title' | 'slug' | 'navLabel' | 'themeColor' | 'startsAt' | 'endsAt' | 'badgeLabel' | 'badgeIcon' | 'badgeImage'> & { siteIds: number[] } | null> => {
  const now = new Date().toISOString();
  const res = await strapiGet<(Sale & { sites: { id: number }[]; featuredSites: { id: number }[] })[]>(
    `/sales?filters[publishedAt][$notNull]=true&filters[startsAt][$lte]=${encodeURIComponent(now)}&filters[endsAt][$gte]=${encodeURIComponent(now)}&fields[0]=title&fields[1]=slug&fields[2]=navLabel&fields[3]=themeColor&fields[4]=startsAt&fields[5]=endsAt&fields[6]=badgeLabel&fields[7]=badgeIcon&populate[0]=badgeImage&populate[sites][fields][0]=id&populate[featuredSites][fields][0]=id&pagination[pageSize]=1`,
    { next: { revalidate: 60 } }
  );
  const sale = res.data[0];
  if (!sale) return null;
  const allSiteIds = [
    ...(sale.sites ?? []).map((s) => s.id),
    ...(sale.featuredSites ?? []).map((s) => s.id),
  ];
  return {
    ...sale,
    siteIds: [...new Set(allSiteIds)],
  };
});

/** Fetch all published bundle slugs (for generateStaticParams). */
export async function getAllBundleSlugs(): Promise<string[]> {
  const res = await strapiGet<Bundle[]>(
    '/bundles?fields[0]=slug&filters[publishedAt][$notNull]=true&locale=en&pagination[pageSize]=100',
    { next: { revalidate: 3600 } }
  );
  return res.data.map((b) => b.slug);
}

/** Fetch all published sale slugs (for generateStaticParams). */
export async function getAllSaleSlugs(): Promise<string[]> {
  const res = await strapiGet<Sale[]>(
    '/sales?fields[0]=slug&filters[publishedAt][$notNull]=true&locale=en&pagination[pageSize]=100',
    { next: { revalidate: 3600 } }
  );
  return res.data.map((s) => s.slug);
}

/** Fetch a full sale by slug and locale. Falls back to 'en' if no translation exists. */
export async function getSaleBySlug(slug: string, locale = 'en'): Promise<Sale | null> {
  const res = await strapiGet<Sale[]>(
    `/sales?${SALE_POPULATE}&filters[slug][$eq]=${encodeURIComponent(slug)}&filters[publishedAt][$notNull]=true&locale=${encodeURIComponent(locale)}`,
    { next: { revalidate: 300 } }
  );
  if (res.data[0]) return res.data[0];
  if (locale !== 'en') {
    const fallback = await strapiGet<Sale[]>(
      `/sales?${SALE_POPULATE}&filters[slug][$eq]=${encodeURIComponent(slug)}&filters[publishedAt][$notNull]=true&locale=en`,
      { next: { revalidate: 300 } }
    );
    return fallback.data[0] ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sitemap helpers
// ---------------------------------------------------------------------------

type SitemapLocalization = { locale: string };

export type SitemapSite = { slug: string; updatedAt: string; localizations: SitemapLocalization[] };
export type SitemapBundle = { slug: string; updatedAt: string; localizations: SitemapLocalization[] };
export type SitemapSale = { slug: string; updatedAt: string; localizations: SitemapLocalization[] };
export type SitemapCategory = { slug: string; updatedAt: string; localizations: SitemapLocalization[] };
export type SitemapArticle = { id: number; slug: string; updatedAt: string; localizations: SitemapLocalization[] };
export type SitemapAuthor = { slug: string; updatedAt: string; localizations: SitemapLocalization[] };
export type SitemapReview = { updatedAt: string; site: { slug: string }; localizations: SitemapLocalization[] };
export type SitemapPage = { slug: string; updatedAt: string; localizations: SitemapLocalization[] };

/** Fetch the total count of published entries for a content type (used by generateSitemaps). */
export async function getSitemapCount(contentType: string, locale?: string): Promise<number> {
  const localeParam = locale ? `&locale=${encodeURIComponent(locale)}` : '';
  const res = await strapiGet<unknown[]>(
    `/${contentType}?filters[publishedAt][$notNull]=true${localeParam}&pagination[pageSize]=1&pagination[page]=1`,
    { next: { revalidate: 86400 } }
  );
  return res.meta.pagination?.total ?? 0;
}

/** Fetch a page of published sites for the sitemap (includes subsites). */
export async function getSitesForSitemap(
  page: number,
  pageSize: number,
): Promise<{ data: SitemapSite[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<SitemapSite[]>(
    `/sites?fields[0]=slug&fields[1]=updatedAt&filters[publishedAt][$notNull]=true&locale=en&populate[localizations][fields][0]=locale&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 86400 } }
  );
  return {
    data: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/** Fetch a page of published bundles for the sitemap. */
export async function getBundlesForSitemap(
  page: number,
  pageSize: number,
): Promise<{ data: SitemapBundle[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<SitemapBundle[]>(
    `/bundles?fields[0]=slug&fields[1]=updatedAt&filters[publishedAt][$notNull]=true&locale=en&populate[localizations][fields][0]=locale&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 86400 } }
  );
  return {
    data: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/** Fetch a page of published sales for the sitemap. */
export async function getSalesForSitemap(
  page: number,
  pageSize: number,
): Promise<{ data: SitemapSale[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<SitemapSale[]>(
    `/sales?fields[0]=slug&fields[1]=updatedAt&filters[publishedAt][$notNull]=true&locale=en&populate[localizations][fields][0]=locale&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 86400 } }
  );
  return {
    data: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/** Fetch a page of published categories (en) for the sitemap. */
export async function getCategoriesForSitemap(
  page: number,
  pageSize: number,
): Promise<{ data: SitemapCategory[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<SitemapCategory[]>(
    `/categories?fields[0]=slug&fields[1]=updatedAt&filters[publishedAt][$notNull]=true&locale=en&populate[localizations][fields][0]=locale&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 86400 } }
  );
  return {
    data: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/** Fetch a page of published articles (en) for the sitemap. */
export async function getArticlesForSitemap(
  page: number,
  pageSize: number,
): Promise<{ data: SitemapArticle[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<SitemapArticle[]>(
    `/articles?fields[0]=id&fields[1]=slug&fields[2]=updatedAt&filters[publishedAt][$notNull]=true&locale=en&populate[localizations][fields][0]=locale&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 86400 } }
  );
  return {
    data: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/** Fetch a page of authors for the sitemap. */
export async function getAuthorsForSitemap(
  page: number,
  pageSize: number,
): Promise<{ data: SitemapAuthor[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<SitemapAuthor[]>(
    `/authors?fields[0]=slug&fields[1]=updatedAt&populate[localizations][fields][0]=locale&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 86400 } }
  );
  return {
    data: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/** Fetch a page of published reviews (en) for the sitemap. */
export async function getReviewsForSitemap(
  page: number,
  pageSize: number,
): Promise<{ data: SitemapReview[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<SitemapReview[]>(
    `/reviews?fields[0]=updatedAt&filters[publishedAt][$notNull]=true&locale=en&populate[site][fields][0]=slug&populate[localizations][fields][0]=locale&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 86400 } }
  );
  return {
    data: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/** Fetch a page of published CMS pages (en) for the sitemap. */
export async function getPagesForSitemap(
  page: number,
  pageSize: number,
): Promise<{ data: SitemapPage[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<SitemapPage[]>(
    `/pages?fields[0]=slug&fields[1]=updatedAt&filters[publishedAt][$notNull]=true&locale=en&populate[localizations][fields][0]=locale&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 86400 } }
  );
  return {
    data: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}
