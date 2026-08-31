/**
 * THE URL grammar for cam listings — category and page live in the PATH:
 *
 *   /live-sex/                    hub, page 1
 *   /live-sex/page/2/             hub, page 2
 *   /live-sex/chaturbate/         a cam site (category of kind 'provider')
 *   /live-sex/big-tits/page/3/    category + page
 *
 * Sort is NOT part of the grammar: canonical pages are always most-viewers, and any other
 * ordering is a filter parameter on /live-sex/filter/ (see filters.ts) — an alternate sort is
 * the same volatile inventory reshuffled, not a page worth an indexable URL.
 *
 * Two reasons this matters more than tidiness:
 *  1. A page that reads searchParams is dynamic FOREVER in the App Router — no static render,
 *     no full-route cache, every visitor pays the render. Path-only listings prerender and
 *     revalidate in the background, which is what makes them land instantly.
 *  2. /live-sex/chaturbate/ is a URL that can rank. `?provider=cb` is not.
 *
 * Client-safe: no server-only imports.
 */

/** Segments that can never be a category slug — grammar words plus retired ones ('newest'). */
export const CAM_RESERVED_SLUGS = new Set(['page', 'newest', 'model', 'out', 'filter']);

const PAGE_SEGMENT = 'page';
/** Mirrors CAM_MAX_PAGE in query.ts (kept literal so this module stays dependency-light). */
const MAX_PAGE = 40;

export type CamListRoute = {
  /** undefined = the hub (all cams). */
  categorySlug?: string;
  page: number;
};

/**
 * Sanitize a username taken from a public URL. Provider handles are word chars, dots, dashes;
 * everything else is stripped. decodeURIComponent throws on malformed escapes (%zz) — callers
 * must get '' (→ 404), never a 500.
 */
export function cleanCamUsername(raw: string): string {
  try {
    return decodeURIComponent(raw).slice(0, 60).replace(/[^\w.-]/g, '');
  } catch {
    return '';
  }
}

/**
 * Parse the catch-all segments into a listing request. Returns null for anything that isn't
 * exactly one canonical spelling of a listing — including `/page/1/`, which would otherwise be
 * a second URL for content that already lives at the bare path.
 */
export function parseCamListPath(segments: string[] | undefined): CamListRoute | null {
  const parts = segments ?? [];
  let i = 0;
  let categorySlug: string | undefined;

  if (parts[i] && parts[i] !== PAGE_SEGMENT) {
    const slug = parts[i];
    // 'model' and 'out' are retired URL forms under /live-sex/ (models moved to
    // /<site>/<username>/, the click counter to /out/model/) — both stay rejected so a
    // stray hit can never render an empty listing.
    if (CAM_RESERVED_SLUGS.has(slug) || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) return null;
    categorySlug = slug;
    i++;
  }

  let page = 1;
  if (parts[i] === PAGE_SEGMENT) {
    const raw = parts[i + 1];
    if (!raw || !/^[1-9][0-9]?$/.test(raw)) return null;
    page = Number(raw);
    if (page < 2 || page > MAX_PAGE) return null; // page 1 is the bare path, not /page/1/
    i += 2;
  }

  if (i !== parts.length) return null;
  return { categorySlug, page };
}

/**
 * Build the EXTERNAL URL for a listing: `?page=N` for pagination (sitewide convention). The
 * proxy rewrites it onto the internal /page/N path route, which is what parseCamListPath
 * serves — external query form, internal static path form.
 */
export function camListPath({ categorySlug, page = 1 }: Partial<CamListRoute> = {}): string {
  const path = categorySlug ? `/live-sex/${categorySlug}/` : '/live-sex/';
  return page > 1 ? `${path}?page=${page}` : path;
}
