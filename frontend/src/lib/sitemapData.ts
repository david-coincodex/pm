/**
 * Shared data plumbing for the sitemap routes (see sitemapXml.ts for why these are hand-rolled).
 *
 * Two invariants every child sitemap gets from here:
 *
 *  - COMPLETENESS. The backend clamps REST responses at maxLimit=100 (backend/config/api.ts) and
 *    does so silently — the previous single sitemap.ts asked for pageSize=50000, got 100, and
 *    shipped 345 of ~750 pages without any error. `fetchAll` pages to exhaustion at the cap.
 *  - NO MEDIA. Sitemap entries are pages only — no <video:video>/<image:image> blocks. The old
 *    combined sitemap attached video entries (with poster/clip URLs) to ad articles; that media
 *    does not belong in the sitemap and the URLs it exposed were host-relative uploads.
 */

import { routing } from '@/i18n/routing';
import { siteSettings } from '@/lib/siteSettings';
import type { SitemapUrl } from '@/lib/sitemapXml';
import type { StrapiPaginationMeta } from '@/lib/strapi';

// The backend's REST maxLimit. Requesting more is silently clamped, so page at exactly this size.
export const SITEMAP_PAGE_SIZE = 100;

type Paged<T> = { data: T[]; pagination: StrapiPaginationMeta };

/** Drain a paged *ForSitemap fetcher to exhaustion. */
export async function fetchAll<T>(fn: (page: number, pageSize: number) => Promise<Paged<T>>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page += 1) {
    const { data, pagination } = await fn(page, SITEMAP_PAGE_SIZE);
    out.push(...data);
    if (page >= (pagination.pageCount ?? 1) || data.length === 0) break;
  }
  return out;
}

export function localizedUrl(locale: string, path: string): string {
  return locale === routing.defaultLocale
    ? `${siteSettings.baseUrl}${path}`
    : `${siteSettings.baseUrl}/${locale}${path}`;
}

type WithLocalizations = { localizations?: { locale: string }[] };

/**
 * hreflang alternates for one item: only the locales the document actually exists in,
 * and only when there is more than one (a single-locale page needs no alternates).
 */
export function buildAlternates(item: WithLocalizations, path: string): Record<string, string> | undefined {
  const existing = new Set([routing.defaultLocale as string, ...(item.localizations ?? []).map((l) => l.locale)]);
  const matched = routing.locales.filter((l) => existing.has(l));
  if (matched.length <= 1) return undefined;
  return Object.fromEntries(matched.map((l) => [l, localizedUrl(l, path)]));
}

/** A collection item -> one sitemap <url> entry (default-locale loc + hreflang alternates). */
export function entry(
  item: WithLocalizations & { updatedAt?: string },
  path: string,
  lastModified?: string | Date | null,
): SitemapUrl {
  return {
    loc: localizedUrl(routing.defaultLocale, path),
    lastModified: lastModified ?? item.updatedAt ?? undefined,
    alternates: buildAlternates(item, path),
  };
}

/** A static path (exists in every locale) -> one sitemap <url> entry. */
export function staticEntry(path: string): SitemapUrl {
  return {
    loc: localizedUrl(routing.defaultLocale, path),
    // hreflang only makes sense with something to alternate TO — omit on single-locale builds.
    alternates:
      routing.locales.length > 1
        ? Object.fromEntries(routing.locales.map((l) => [l, localizedUrl(l, path)]))
        : undefined,
  };
}
