import { routing } from '@/i18n/routing';

function localePathPrefix(locale: string): string {
  return locale === routing.defaultLocale ? '' : `/${locale}`;
}

export function localizedPath(path: string, locale: string): string {
  return `${localePathPrefix(locale)}${path}`;
}

export function localizedAlternates(
  path: string,
  locale: string
): Pick<NonNullable<import('next').Metadata['alternates']>, 'canonical' | 'languages'> {
  // Single-locale build: hreflang pointing only at yourself is noise — canonical is enough.
  if (routing.locales.length < 2) {
    return { canonical: localizedPath(path, locale) };
  }

  const languages: Record<string, string> = Object.fromEntries(
    routing.locales.map((loc) => [loc, localizedPath(path, loc)])
  );
  languages['x-default'] = path;

  return {
    canonical: localizedPath(path, locale),
    languages,
  };
}

/**
 * Build canonical & alternate URLs for a paginated listing page.
 * Handles page query param, locale prefixes, and x-default.
 */
export function paginatedAlternates(
  basePath: string,
  page: number,
  locale: string
): Pick<NonNullable<import('next').Metadata['alternates']>, 'canonical' | 'languages'> {
  const pageQuery = page > 1 ? `?page=${page}` : '';
  return localizedAlternates(`${basePath}${pageQuery}`, locale);
}

/**
 * Compute prev/next link hrefs for a paginated listing page.
 */
export function paginatedNavLinks(
  basePath: string,
  page: number,
  pageCount: number
): { prevHref: string | null; nextHref: string | null } {
  const prevHref = page > 1 ? (page === 2 ? basePath : `${basePath}?page=${page - 1}`) : null;
  const nextHref = page < pageCount ? `${basePath}?page=${page + 1}` : null;
  return { prevHref, nextHref };
}

/** Parse a page query string into a positive integer, defaulting to 1. */
export function parsePage(s: string | undefined): number {
  const n = parseInt(s ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Append " (Page N)" to a title when page > 1. */
export function paginatedTitle(title: string, page: number): string {
  return page > 1 ? `${title} (Page ${page})` : title;
}
