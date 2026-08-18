/**
 * Legacy WordPress -> Next redirect map, applied by the Next routing layer.
 *
 * These are declarative config redirects (`next.config.ts` -> `redirects()`), NOT the runtime
 * rules in `src/lib/redirects.ts`. The difference matters:
 *
 *   - config redirects are compiled into the routing manifest at build time and answered before
 *     any application code runs — no `proxy.ts` invocation, no `next-intl` pass, no React.
 *   - `src/lib/redirects.ts` runs inside `proxy.ts` on every matched request, so it can make
 *     decisions this file cannot (and pays for it on every request).
 *
 * Anything with a fixed source and a fixed destination belongs HERE. Keep `src/lib/redirects.ts`
 * for rules that genuinely need request-time logic.
 *
 * Status code is an explicit 301 rather than Next's `permanent: true` (which emits 308), so that
 * every permanent redirect the site serves — these and the ones from `proxy.ts` — is the same code.
 *
 * Sources are written WITHOUT a trailing slash. `trailingSlash: true` is set in next.config.ts, so
 * Next normalises the incoming path before matching and both `/dmca` and `/dmca/` hit the rule.
 * Destinations DO carry the trailing slash, to land on the canonical URL in one hop.
 */

/** @typedef {{ source: string, destination: string, note?: string }} LegacyRedirect */

/**
 * Retired WordPress static pages.
 *
 * `/dmca/` -> `/page/disclaimer/` is a content decision, not a slug rename: confirm the disclaimer
 * page actually carries the DMCA notice-and-takedown text, since that page has legal weight.
 */
/** @type {LegacyRedirect[]} */
const STATIC_PAGES = [
  { source: '/terms-of-service', destination: '/page/terms/' },
  { source: '/privacy-policy-2', destination: '/page/privacy/' },
  { source: '/dmca', destination: '/page/disclaimer/' },
  { source: '/contact', destination: '/page/contact/' },
];

/**
 * WordPress blog categories (`/blog/category/<x>/`) folded into the site-category route
 * (`/best-<x>-sites/`).
 *
 * These are the complete set of topical matches, not a first pass: 109 candidate slugs were probed
 * against production (all of our category slugs plus variants), and it has exactly 11 blog categories
 * with no empty-but-live archives and no alternate URL base.
 *
 * Production's other blog categories (`featured`, `guides`, `paysites`, `pornstars`, `sex-games`,
 * `top-picks`, `uncategorized`) are left to 404 by decision, NOT because they are empty — five of
 * them archive articles we still publish (`guides` 10/10, `paysites` 8/8, `pornstars` 9/10). What we
 * lack is a route to group them: `article.categories` exists as a relation and is populated on 0 of
 * 76 articles. See docs/prod-sitemap-crossref-2026-08-03.md §4a before adding rules for them.
 */
/** @type {LegacyRedirect[]} */
const BLOG_CATEGORIES = [
  { source: '/blog/category/live-sex', destination: '/best-live-sex-sites/' },
  { source: '/blog/category/vr-porn', destination: '/best-vr-porn-sites/' },
  // `/blog/category/celebrity` had a rule pointing at /best-celebrity-porn-sites/ until that
  // category was deleted from the CMS (2026-08-03, along with ai/arab/asmr/japanese-porn) — a
  // redirect into a 404 is worse than the 404 itself. Reinstate it if the category returns.
];

/**
 * No article rules live here by design.
 *
 * The blog route keys off `postId` and already 308s any wrong slug segment to the canonical URL, so an
 * article whose id matches production needs no rule — and one whose id does NOT match should have the id
 * corrected in the CMS (`scripts/fix-url-parity.mjs`) rather than papered over with a redirect.
 */

/**
 * WordPress blog tag archives folded into the article that now owns the topic. Only tags with
 * a genuine successor get a rule — a redirect into a loosely-related page is worse than a 404.
 */
/** @type {LegacyRedirect[]} */
const BLOG_TAGS = [
  // The cross-network ads roundup (postId pinned in scripts/ad-jobs.json).
  { source: '/blog/tag/porn-ads', destination: '/blog/4270/best-porn-ads/' },
];

/** @type {LegacyRedirect[]} */
export const LEGACY_REDIRECTS = [...STATIC_PAGES, ...BLOG_CATEGORIES, ...BLOG_TAGS];

/**
 * Expand every rule across the configured locales.
 *
 * Config redirects are matched before `next-intl` gets involved, so the locale prefix is not
 * stripped for us the way `resolveRedirect` strips it — each non-default locale needs its own
 * rule, with the prefix carried through to the destination so `/de/dmca/` stays in German.
 *
 * @param {readonly string[]} locales
 * @param {string} defaultLocale
 */
export function buildLegacyRedirects(locales, defaultLocale) {
  return LEGACY_REDIRECTS.flatMap(({ source, destination }) =>
    locales.map((locale) => {
      const prefix = locale === defaultLocale ? '' : `/${locale}`;
      return { source: `${prefix}${source}`, destination: `${prefix}${destination}`, statusCode: 301 };
    }),
  );
}
