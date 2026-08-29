import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { CAM_PROVIDER_SLUGS } from './lib/cams/types';
import { resolveRedirect } from './lib/redirects';

const intlMiddleware = createMiddleware(routing);

/** Facet params that mark a cam URL as a filtered state (served by the internal filter route). */
const CAM_FACET_PARAMS = ['site', 'gender', 'tags', 'language', 'sort', 'fav'];
/**
 * The retired single-letter grammar (?p=cb&g=f&c=milf&l=deutsch) → readable params. Links in
 * the wild get one 301 onto the new form; values that don't translate are dropped there.
 */
const LEGACY_FACET_PARAMS: Record<string, { name: string; values?: Record<string, string> }> = {
  p: { name: 'site', values: { cb: 'chaturbate', bc: 'bongacams' } },
  g: { name: 'gender', values: { f: 'female', m: 'male', c: 'couples', t: 'trans' } },
  c: { name: 'tags' },
  l: { name: 'language' },
};
/** Model-page subpaths, derived from THE provider-slug mapping — a third provider added to
 * CAM_PROVIDER_SLUGS is covered here automatically. */
const MODEL_PATH_RE = new RegExp(`^/(${Object.values(CAM_PROVIDER_SLUGS).join('|')})/[\\w.-]+/?$`);
/** `/live-sex` or `/de/live-sex` plus anything below it; group 1 = locale prefix, 2 = subpath. */
const CAM_PATH_RE = /^(\/(?:de))?\/live-sex(\/.*)?$/;

/**
 * The cam listings' EXTERNAL URLs use query params (?page=, ?g=…) while the INTERNAL routes
 * stay path-based and statically rendered — a page that read searchParams would be dynamic
 * forever. This bridge maps one onto the other; it runs for cache hits too, so nothing here
 * costs the pages their static rendering.
 */
function camUrlBridge(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  const match = pathname.match(CAM_PATH_RE);
  if (!match) return null;
  const prefix = match[1] ?? '';
  const subpath = match[2] ?? '/';
  // Rewrites bypass the intl middleware, so they must target the LOCALE-PREFIXED internal
  // path themselves (app routes live under /[locale]/…). Redirects stay in external form.
  const internalPrefix = prefix || `/${routing.defaultLocale}`;
  // Model pages — two segments under a provider slug (/bongacams/<username>/) — must never
  // be bridged: stray facet params on a shared model link would 301 it to the hub.
  // (The /out/ click counter moved to top-level /out/model/… and is matcher-excluded.)
  if (MODEL_PATH_RE.test(subpath)) return null;

  // Legacy internal forms reached directly → one external URL per content (301).
  const legacyPage = subpath.match(/^(.*?)\/?page\/(\d+)\/?$/);
  if (legacyPage) {
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}/live-sex${legacyPage[1] || ''}/`.replace(/\/\/$/, '/');
    if (Number(legacyPage[2]) > 1) url.searchParams.set('page', legacyPage[2]);
    return NextResponse.redirect(url, 301);
  }
  if (/^\/filter(\/|$)/.test(subpath)) {
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}/live-sex/`;
    return NextResponse.redirect(url, 301);
  }

  // Legacy short params → one 301 onto the readable grammar (merging into any new-form
  // params already present), then the normal facet handling sees only the new names.
  // (A legacy PATH form combined with legacy params takes the path hop first — two 301s
  // total for that museum piece; params alone always upgrade in one.)
  // The query is rebuilt BY HAND: searchParams.set would percent-encode the comma joins
  // (%2C), which is exactly the noise the readable grammar exists to avoid. Every emitted
  // value is reduced to [a-z0-9-] first — legacy values are arbitrary user input and this
  // string ends up in a Location header.
  if (Object.keys(LEGACY_FACET_PARAMS).some((k) => searchParams.has(k))) {
    const url = request.nextUrl.clone();
    // Facets only live on the hub path (the category-path rule below would bounce them there
    // anyway) — going straight to the hub keeps ancient links to one redirect, not a chain.
    url.pathname = `${prefix}/live-sex/`;
    const clean = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const facets = new Map<string, string[]>();
    const collect = (name: string, values: string[]) => {
      if (!values.length) return;
      const list = facets.get(name) ?? [];
      // Same per-facet cap as the parser (filters.ts split) — a hand-crafted URL with hundreds
      // of comma values must not become a hundreds-long Location header.
      for (const v of values) if (v && !list.includes(v) && list.length < 20) list.push(v);
      facets.set(name, list);
    };
    for (const name of CAM_FACET_PARAMS) {
      const raw = url.searchParams.get(name);
      if (raw !== null) collect(name, raw.split(',').map(clean));
    }
    for (const [legacy, { name, values }] of Object.entries(LEGACY_FACET_PARAMS)) {
      const raw = url.searchParams.get(legacy);
      if (raw !== null) collect(name, raw.split(',').map((v) => (values ? (values[clean(v)] ?? '') : clean(v))));
    }
    // Emit in the grammar's stable order (site, gender, tags, language, sort, fav) and skip
    // facets whose every value translated to nothing — `gender=` is not a parameter.
    const parts = CAM_FACET_PARAMS.flatMap((name) => {
      const list = facets.get(name) ?? [];
      return list.length ? [`${name}=${list.join(',')}`] : [];
    });
    const pageParam = url.searchParams.get('page');
    if (pageParam && /^[1-9]\d{0,3}$/.test(pageParam) && pageParam !== '1') parts.push(`page=${pageParam}`);
    // Params outside the filter grammar (utm_*, click ids) ride along unchanged — the upgrade
    // redirect must not cost a legacy link its attribution. These are arbitrary input, so they
    // go through URLSearchParams and get properly encoded.
    const passthrough = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
      if (!(k in LEGACY_FACET_PARAMS) && !CAM_FACET_PARAMS.includes(k) && k !== 'page') passthrough.append(k, v);
    }
    const tail = passthrough.toString();
    if (tail) parts.push(tail);
    url.search = parts.length ? `?${parts.join('&')}` : '';
    return NextResponse.redirect(url, 301);
  }

  const hasFacets = CAM_FACET_PARAMS.some((k) => searchParams.has(k));
  const page = searchParams.get('page');

  if (hasFacets) {
    // Facet params on a CATEGORY path would silently drop the segment (the filter route only
    // reads the query) — content contradicting its URL. One honest form: 301 to the hub path.
    if (subpath !== '/' && subpath !== '') {
      const url = request.nextUrl.clone();
      url.pathname = `${prefix}/live-sex/`;
      return NextResponse.redirect(url, 301);
    }
    // Filtered state → internal filter route (canonical /live-sex/ is set by that page).
    const url = request.nextUrl.clone();
    url.pathname = `${internalPrefix}/live-sex/filter`;
    return NextResponse.rewrite(url);
  }

  // ?page=N → internal /page/N path (the statically rendered pagination grammar).
  if (page !== null) {
    // page=1 or junk: one URL per content — 301 to the bare path.
    if (!/^[1-9]\d{0,3}$/.test(page) || page === '1') {
      const url = request.nextUrl.clone();
      url.searchParams.delete('page');
      return NextResponse.redirect(url, 301);
    }
    // Numeric ≥2 rewrites unconditionally; the route's own grammar 404s anything past its
    // maximum — returning null here would silently serve page 1 under a ?page=999 URL.
    const url = request.nextUrl.clone();
    const bare = pathname.replace(/\/$/, '');
    url.pathname = `${prefix ? bare : `/${routing.defaultLocale}${bare}`}/page/${page}`;
    url.searchParams.delete('page');
    return NextResponse.rewrite(url);
  }

  return null;
}

/** Cloudflare's visitor country → readable cookie (only when missing/changed, so steady-state
 * responses stay Set-Cookie-free and CDN-cacheable). Client code geo-personalizes from it —
 * no page ever reads geo headers server-side, which would cost the listings static rendering. */
function attachGeoCookie(request: NextRequest, response: NextResponse): NextResponse {
  const cc = request.headers.get('cf-ipcountry');
  if (cc && /^[A-Za-z]{2}$/.test(cc) && request.cookies.get('pm_cc')?.value !== cc.toUpperCase()) {
    response.cookies.set('pm_cc', cc.toUpperCase(), { maxAge: 7 * 24 * 60 * 60, sameSite: 'lax', path: '/' });
  }
  return response;
}

export default function proxy(request: NextRequest) {
  // Server-side 301 redirects (with wildcard support) take precedence over locale routing.
  const destination = resolveRedirect(
    request.nextUrl.pathname,
    routing.locales,
    routing.defaultLocale,
  );
  if (destination) {
    if (/^https?:\/\//i.test(destination)) {
      return NextResponse.redirect(destination, 301);
    }
    const url = request.nextUrl.clone();
    url.pathname = destination; // query string is preserved by clone()
    return NextResponse.redirect(url, 301);
  }

  const camBridge = camUrlBridge(request);
  // Bridged responses (rewritten filter/pagination views) carry the geo cookie too — a visitor
  // can land directly on a filtered URL and the language ordering should still know them.
  if (camBridge) return attachGeoCookie(request, camBridge);

  return attachGeoCookie(request, intlMiddleware(request));
}

export const config = {
  // Match all paths except API routes, Next.js internals, static files, and the locale-free
  // machine route /out/ (the 302 click counter).
  matcher: [
    '/((?!api|_next|_vercel|out/|.*\\..*).*)',
    // Usernames may contain dots, which the static-file exclusion above would treat as files
    // (middleware skipped → trailing-slash 308 into a 404). Re-include the whole cam tree.
    '/live-sex/:path*',
  ],
};
