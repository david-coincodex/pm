// Public URL — shown in the UI and used by the browser for client-side calls
export const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1339';

// Internal URL — used by Next.js Server Components when running inside Docker
// (e.g. http://backend:1339). Falls back to the public URL outside Docker.
const STRAPI_FETCH_URL = process.env.STRAPI_INTERNAL_URL ?? STRAPI_URL;

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

export type Subsite = {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  logo: StrapiMedia | null;
  cover_image: StrapiMedia | null;
  isActive: boolean;
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

export type Site = {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  url: string;
  short_description: string | null;
  description: Record<string, unknown>[] | null;
  siteType: 'paysite' | 'camsite' | 'datingsite' | 'tubesite';
  logo: StrapiMedia | null;
  cover_image: StrapiMedia | null;
  included: string | null;
  gallery: StrapiMedia[];
  offers: Offer[];
  subsites: Subsite[];
  platform: Platform | null;
};

/** Resolve a Strapi media URL to an absolute URL */
export function strapiMediaUrl(media: StrapiMedia): string {
  if (media.url.startsWith('http')) return media.url;
  return `${STRAPI_URL}${media.url}`;
}

type FetchOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | null;
  token?: string;
};

export async function strapiGet<T>(
  path: string,
  options: FetchOptions = {}
): Promise<StrapiResponse<T>> {
  const { token, headers = {}, ...rest } = options;

  const res = await fetch(`${STRAPI_FETCH_URL}/api${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string>),
    },
    // Enable Next.js cache control — adjust per use case
    next: { revalidate: 60 },
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
  cover_image: StrapiMedia | null;
  sites: Site[];
};

/** Fetch a single category by slug with up to `limit` of its sites (with offers). */
export async function getCategoryWithSites(slug: string, limit = 3): Promise<Category | null> {
  const res = await strapiGet<Category[]>(
    `/categories?populate[0]=sites&populate[1]=sites.logo&populate[2]=sites.cover_image&populate[3]=sites.offers&filters[slug][$eq]=${encodeURIComponent(slug)}&pagination[pageSize]=1`,
    { next: { revalidate: 300 } } as Parameters<typeof strapiGet>[1]
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

/** Fetch up to `limit` published bundles with their sites + offers. */
export async function getPublishedBundles(limit = 3): Promise<Bundle[]> {
  const res = await strapiGet<Bundle[]>(
    `/bundles?populate[0]=sites&populate[1]=sites.logo&populate[2]=sites.cover_image&populate[3]=sites.offers&populate[4]=offers&sort=createdAt:desc&pagination[pageSize]=${limit}`,
    { next: { revalidate: 300 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data;
}

/** Fetch up to `limit` bundles that contain the given site slug. */
export async function getBundlesForSite(siteSlug: string, limit = 3): Promise<Bundle[]> {
  const res = await strapiGet<Bundle[]>(
    `/bundles?filters[sites][slug][$eq]=${encodeURIComponent(siteSlug)}&populate[0]=sites&populate[1]=sites.logo&populate[2]=sites.cover_image&populate[3]=sites.offers&populate[4]=offers&sort=createdAt:desc&pagination[pageSize]=${limit}`,
    { next: { revalidate: 300 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data;
}

/** Fetch a paginated list of published bundles with their sites + offers. */
export async function getBundlesPaginated(
  page = 1,
  pageSize = 12,
): Promise<{ bundles: Bundle[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<Bundle[]>(
    `/bundles?populate[0]=sites&populate[1]=sites.logo&populate[2]=sites.cover_image&populate[3]=sites.offers&populate[4]=offers&sort=createdAt:desc&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 300 } } as Parameters<typeof strapiGet>[1]
  );
  return {
    bundles: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/** Fetch a single bundle by slug with sites, their offers, and the bundle's own offers. */
export async function getBundleBySlug(slug: string): Promise<Bundle | null> {
  const res = await strapiGet<Bundle[]>(
    `/bundles?populate[0]=sites&populate[1]=sites.logo&populate[2]=sites.cover_image&populate[3]=sites.offers&populate[4]=offers&populate[5]=cover_image&populate[6]=gallery&filters[slug][$eq]=${encodeURIComponent(slug)}`,
    { next: { revalidate: 60 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data[0] ?? null;
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

/** Fetch all active sites that have at least one active offer, with offers populated. */
export async function getSitesWithDeals(): Promise<Site[]> {
  const res = await strapiGet<Site[]>(
    '/sites?populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[isActive][$eq]=true&filters[offers][isActive][$eq]=true&sort=name:asc'
  );
  return res.data;
}

/** Fetch active sites with at least one lifetime offer, max 4, sorted by name. */
export async function getLifetimeDeals(limit = 4): Promise<Site[]> {
  const res = await strapiGet<Site[]>(
    `/sites?populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[isActive][$eq]=true&filters[offers][isActive][$eq]=true&filters[offers][offerType][$eq]=lifetime&sort=name:asc&pagination[pageSize]=${limit}`,
  );
  return res.data;
}

/** Fetch active cam sites with at least one active offer, max 4, sorted by name. */
export async function getCamSiteDeals(limit = 4): Promise<Site[]> {
  const res = await strapiGet<Site[]>(
    `/sites?populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[isActive][$eq]=true&filters[siteType][$eq]=camsite&filters[offers][isActive][$eq]=true&sort=name:asc&pagination[pageSize]=${limit}`,
  );
  return res.data;
}

/** Fetch active featured deals with their sites + offers, sorted by priority desc. */
export async function getFeaturedDeals(): Promise<Featured[]> {
  const now = new Date().toISOString();
  const res = await strapiGet<Featured[]>(
    `/featureds?populate[0]=site&populate[1]=site.logo&populate[2]=site.cover_image&populate[3]=site.offers&filters[isActive][$eq]=true&filters[$or][0][validFrom][$null]=true&filters[$or][0][validTo][$null]=true&filters[$or][1][validFrom][$lte]=${now}&filters[$or][1][validTo][$gte]=${now}&sort=priority:desc&pagination[pageSize]=10`,
    { next: { revalidate: 60 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data;
}

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
    `/sites?populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[isActive][$eq]=true&filters[offers][isActive][$eq]=true&sort=name:asc&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
  );
  return {
    sites: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/** Fetch top N active sites with offers, optionally excluding a slug. */
export async function getTopDeals(limit = 4, excludeSlug?: string): Promise<Site[]> {
  const res = await strapiGet<Site[]>(
    `/sites?populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[isActive][$eq]=true&filters[offers][isActive][$eq]=true&sort=createdAt:desc&pagination[pageSize]=${limit + 1}`,
    { next: { revalidate: 300 } } as Parameters<typeof strapiGet>[1]
  );
  const all = res.data.filter((s) => s.slug !== excludeSlug);
  return all.slice(0, limit);
}

/** Fetch the active site by slug with its offers and subsites. */
export async function getDealBySiteSlug(slug: string): Promise<Site | null> {
  const res = await strapiGet<Site[]>(
    `/sites?populate[0]=logo&populate[1]=cover_image&populate[2]=offers&populate[3]=subsites&populate[4]=subsites.logo&populate[5]=subsites.cover_image&populate[6]=gallery&populate[7]=platform&populate[8]=platform.logo&populate[9]=platform.paymentMethods&filters[slug][$eq]=${encodeURIComponent(slug)}&filters[isActive][$eq]=true`,
    { next: { revalidate: 60 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data[0] ?? null;
}

/** Fetch a single offer by numeric id, populated with its site. */
export async function getOfferById(id: number): Promise<(Offer & { site: Site }) | null> {
  const res = await strapiGet<(Offer & { site: Site })[]>(
    `/offers?populate[0]=site&populate[1]=site.logo&populate[2]=site.cover_image&filters[id][$eq]=${id}&filters[isActive][$eq]=true`,
    { next: { revalidate: 60 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data[0] ?? null;
}

/** Fetch all active sites, populated with logo and cover image. */
export async function getSites(): Promise<Site[]> {
  const res = await strapiGet<Site[]>(
    '/sites?populate[0]=logo&populate[1]=cover_image&filters[isActive][$eq]=true&sort=name:asc'
  );
  return res.data;
}

/** Fetch all categories (for static path generation). */
export async function getAllCategories(): Promise<Category[]> {
  const res = await strapiGet<Category[]>(
    '/categories?pagination[pageSize]=100',
    { next: { revalidate: 3600 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data;
}

/** Fetch all published categories with cover images and their site counts. */
export async function getCategoriesGrid(): Promise<(Category & { siteCount: number })[]> {
  const res = await strapiGet<(Category & { sites: Site[] })[]>(
    '/categories?populate[0]=cover_image&populate[1]=sites&pagination[pageSize]=100&sort=name:asc',
    { next: { revalidate: 300 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data.map((cat) => ({
    ...cat,
    siteCount: (cat.sites ?? []).length,
    sites: [],
  }));
}

/** Fetch a category by slug (metadata only, no sites). */
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const res = await strapiGet<Category[]>(
    `/categories?filters[slug][$eq]=${encodeURIComponent(slug)}&pagination[pageSize]=1`,
    { next: { revalidate: 300 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data[0] ?? null;
}

/** Fetch a paginated list of active sites belonging to a category slug. */
export async function getSitesByCategorySlug(
  categorySlug: string,
  page = 1,
  pageSize = 12,
): Promise<{ sites: Site[]; pagination: StrapiPaginationMeta }> {
  const res = await strapiGet<Site[]>(
    `/sites?populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[isActive][$eq]=true&filters[offers][isActive][$eq]=true&filters[categories][slug][$eq]=${encodeURIComponent(categorySlug)}&sort=name:asc&pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
    { next: { revalidate: 300 } } as Parameters<typeof strapiGet>[1]
  );
  return {
    sites: res.data,
    pagination: res.meta.pagination ?? { page, pageSize, pageCount: 1, total: res.data.length },
  };
}

/** Fetch a single site by slug. Returns null if not found. */
export async function getSiteBySlug(slug: string): Promise<Site | null> {
  const res = await strapiGet<Site[]>(
    `/sites?populate[0]=logo&populate[1]=cover_image&filters[slug][$eq]=${encodeURIComponent(slug)}&filters[isActive][$eq]=true`,
    { next: { revalidate: 60 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data[0] ?? null;
}

/** Fetch a subsite by its own slug, including its parent site with offers. */
export async function getSubsiteBySlug(subslug: string): Promise<(Subsite & { site: Site & { offers: Offer[] } }) | null> {
  const res = await strapiGet<(Subsite & { site: Site & { offers: Offer[] } })[]>(
    `/subsites?populate[0]=logo&populate[1]=cover_image&populate[2]=site&populate[3]=site.logo&populate[4]=site.cover_image&populate[5]=site.offers&filters[slug][$eq]=${encodeURIComponent(subslug)}&filters[isActive][$eq]=true`,
    { next: { revalidate: 60 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data[0] ?? null;
}

/** Search sites by name or short_description. Runs server-side (no cache). */
export async function searchSites(query: string): Promise<Site[]> {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];
  const res = await strapiGet<Site[]>(
    `/sites?populate[0]=logo&populate[1]=cover_image&populate[2]=offers&filters[isActive][$eq]=true&filters[$or][0][name][$containsi]=${q}&filters[$or][1][short_description][$containsi]=${q}&sort=name:asc&pagination[pageSize]=10`,
    { next: { revalidate: 0 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data;
}

/** Search subsites by name. Returns subsites with their parent site populated. */
export async function searchSubsites(query: string): Promise<(Subsite & { site: Site })[]> {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];
  const res = await strapiGet<(Subsite & { site: Site })[]>(
    `/subsites?populate[0]=logo&populate[1]=site&populate[2]=site.logo&populate[3]=site.offers&filters[isActive][$eq]=true&filters[name][$containsi]=${q}&sort=name:asc&pagination[pageSize]=10`,
    { next: { revalidate: 0 } } as Parameters<typeof strapiGet>[1]
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
  authors: ArticleAuthor[];
  editors: ArticleAuthor[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  locale: string;
};

const ARTICLE_POPULATE =
  'populate[0]=coverImage&populate[1]=categories&populate[2]=tags&populate[3]=authors&populate[4]=authors.avatar&populate[5]=editors&populate[6]=editors.avatar';

/** Fetch published articles for a locale, newest first. */
export async function getArticles(locale: string): Promise<Article[]> {
  const res = await strapiGet<Article[]>(
    `/articles?${ARTICLE_POPULATE}&filters[publishedAt][$notNull]=true&locale=${encodeURIComponent(locale)}&sort=publishedAt:desc`
  );
  return res.data;
}

/** Fetch the latest N published articles for a locale. */
export async function getLatestArticles(locale: string, limit = 8): Promise<Article[]> {
  const res = await strapiGet<Article[]>(
    `/articles?${ARTICLE_POPULATE}&filters[publishedAt][$notNull]=true&locale=${encodeURIComponent(locale)}&sort=publishedAt:desc&pagination[pageSize]=${limit}`,
    { next: { revalidate: 300 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data;
}

/** Fetch a single article by numeric id and slug. Returns null if not found. */
export async function getArticleById(id: number, locale: string): Promise<Article | null> {
  const res = await strapiGet<Article[]>(
    `/articles?${ARTICLE_POPULATE}&filters[id][$eq]=${id}&filters[publishedAt][$notNull]=true&locale=${encodeURIComponent(locale)}`,
    { next: { revalidate: 60 } } as Parameters<typeof strapiGet>[1]
  );
  return res.data[0] ?? null;
}
