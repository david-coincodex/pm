/**
 * Server-side 301 (permanent) redirect system.
 *
 * Rules are matched in `middleware.ts` BEFORE next-intl locale routing, so they always win.
 * Matching is locale-aware: a leading locale prefix (e.g. `/de`) is stripped before matching and
 * re-applied to the destination, so one rule covers every locale.
 *
 * Add a rule to REDIRECTS:
 *   { source: '/discounts', destination: '/' }            // exact path -> path
 *   { source: '/old-blog/*', destination: '/blog' }       // wildcard -> fixed path
 *   { source: '/old-blog/*', destination: '/blog/*' }     // wildcard -> carries the matched suffix
 *   { source: '/promo', destination: 'https://example.com/promo' }  // external (verbatim)
 *
 * Notes:
 * - `source`/`destination` are matched/compared without trailing slashes; the resolver re-adds a
 *   trailing slash to internal destinations to match the app's `trailingSlash: true` setting.
 * - `*` is a single trailing wildcard (matches the rest of the path). Put it at the end of `source`.
 */

export type RedirectRule = { source: string; destination: string };

export const REDIRECTS: RedirectRule[] = [
  { source: '/discounts', destination: '/' },
];

const isExternal = (dest: string) => /^https?:\/\//i.test(dest);

/** Remove trailing slashes (but keep the root "/"). */
const stripSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/** Re-apply the locale prefix and a trailing slash to an internal destination path. */
function buildInternal(dest: string, localePrefix: string): string {
  const base = dest === '/' ? '' : dest;
  let out = `${localePrefix}${base}`;
  if (out === '') out = '/';
  if (!out.endsWith('/')) out += '/';
  return out;
}

/**
 * Returns the destination URL/path for `pathname`, or null if no rule matches.
 * Internal destinations come back locale-prefixed + trailing-slashed; external ones verbatim.
 */
export function resolveRedirect(
  pathname: string,
  locales: readonly string[],
  defaultLocale: string,
): string | null {
  // Split off an optional (non-default) locale prefix so one rule serves all locales.
  let localePrefix = '';
  let rest = pathname;
  const maybeLocale = pathname.split('/')[1];
  if (maybeLocale && maybeLocale !== defaultLocale && locales.includes(maybeLocale)) {
    localePrefix = `/${maybeLocale}`;
    rest = pathname.slice(localePrefix.length) || '/';
  }
  const path = stripSlash(rest) || '/';

  for (const rule of REDIRECTS) {
    const source = stripSlash(rule.source) || '/';
    let matched = false;
    let splat = '';

    if (source.endsWith('/*')) {
      const prefix = source.slice(0, -2); // e.g. "/old-blog"
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        matched = true;
        splat = path.slice(prefix.length).replace(/^\//, '');
      }
    } else if (path === source) {
      matched = true;
    }
    if (!matched) continue;

    const rawDest = rule.destination.includes('*')
      ? rule.destination.replace('*', splat)
      : rule.destination;

    if (isExternal(rawDest)) return rawDest;

    const dest = buildInternal(rawDest, localePrefix);
    // Guard against redirecting a path to itself (would loop).
    if (stripSlash(dest) === stripSlash(pathname)) return null;
    return dest;
  }

  return null;
}
