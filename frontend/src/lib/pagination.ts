import { routing } from '@/i18n/routing';

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
  const localePath = locale === routing.defaultLocale ? '' : `/${locale}`;
  const canonical = `${localePath}${basePath}${pageQuery}`;

  const languages: Record<string, string> = Object.fromEntries(
    routing.locales.map((loc) => {
      const prefix = loc === routing.defaultLocale ? '' : `/${loc}`;
      return [loc, `${prefix}${basePath}${pageQuery}`];
    })
  );
  languages['x-default'] = `${basePath}${pageQuery}`;

  return { canonical, languages };
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
