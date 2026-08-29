import { CAM_PROVIDER_SLUGS, type CamGender, type CamProvider } from './types';
import { camListPath } from './urls';
import { isCamLanguage } from './languages';

/**
 * Multi-select browse state: any combination of platforms, model types and categories.
 *
 * Semantics are the usual faceted-search ones — OR inside a facet, AND across facets. Checking
 * Chaturbate + BongaCams widens the platform choice; adding "Teen" narrows the result to models
 * on either platform that are also in that category.
 *
 * HOW THIS STAYS FAST
 * -------------------
 * Combinations are unbounded, so they cannot all be prerendered — but the handful of states
 * that matter for SEO can be, and are. Every state that corresponds to a single canonical page
 * (the default view, one platform, one model type, one category) resolves to its static path;
 * everything else goes to /live-sex/filter/, a dynamic route that renders per request from the
 * in-memory snapshot. So the pages that rank stay prerendered and instant, and the long tail of
 * ad-hoc combinations is still fully server-rendered — no client-side data fetching, no
 * duplicate card rendering, and every state is a real, shareable URL that works without JS.
 */

export type CamFilterState = {
  providers: CamProvider[];
  genders: CamGender[];
  /** Slugs of `tag` categories. */
  tags: string[];
  /** Canonical language keys (lib/cams/languages.ts). */
  languages: string[];
};

/** Most of the audience is looking for women; start there and let them widen it. */
export const DEFAULT_CAM_FILTER: CamFilterState = { providers: [], genders: ['f'], tags: [], languages: [] };

/**
 * Externally, filtered states live on the hub path itself (/live-sex/?gender=female,male…)
 * with canonical /live-sex/ — proxy.ts rewrites them to the internal /live-sex/filter route.
 */
const CAM_FILTER_EXTERNAL = '/live-sex/';

/** Just enough of a cam-category to seed a state — avoids importing the server-only module. */
export type CategoryLike = {
  kind: 'gender' | 'tag' | 'provider' | 'language';
  slug: string;
  genderKey: CamGender | null;
  providerKey: CamProvider | null;
  languageKey: string | null;
};

const uniqueSorted = <T extends string>(v: T[]): T[] => [...new Set(v)].sort();

export function normalizeFilter(state: CamFilterState): CamFilterState {
  return {
    providers: uniqueSorted(state.providers),
    genders: uniqueSorted(state.genders),
    tags: uniqueSorted(state.tags),
    languages: uniqueSorted(state.languages),
  };
}

const key = (state: CamFilterState): string => {
  const n = normalizeFilter(state);
  return `p:${n.providers}|g:${n.genders}|t:${n.tags}|l:${n.languages}`;
};

const filtersEqual = (a: CamFilterState, b: CamFilterState): boolean => key(a) === key(b);

export const isDefaultFilter = (state: CamFilterState): boolean => filtersEqual(state, DEFAULT_CAM_FILTER);

/**
 * The category's canonical PAGE path: the hub for the category that duplicates the default
 * view (female — its own page would be a duplicate; we link the one real URL instead),
 * /live-sex/<slug>/ for everything else. Every surface that links a category goes through
 * this so /live-sex/female/ can never appear anywhere.
 */
export function camCategoryPath(category: CategoryLike): string {
  return isDefaultFilter(seedFilterFor(category)) ? camListPath() : camListPath({ categorySlug: category.slug });
}

/**
 * The state a canonical category page represents. A gender page REPLACES the default gender
 * (the male page must not also list women); a platform or category page narrows within it.
 */
export function seedFilterFor(category: CategoryLike | null): CamFilterState {
  if (!category) return DEFAULT_CAM_FILTER;
  if (category.kind === 'gender') {
    return { providers: [], genders: category.genderKey ? [category.genderKey] : [], tags: [], languages: [] };
  }
  if (category.kind === 'provider') {
    return { ...DEFAULT_CAM_FILTER, providers: category.providerKey ? [category.providerKey] : [] };
  }
  if (category.kind === 'language') {
    return { ...DEFAULT_CAM_FILTER, languages: category.languageKey ? [category.languageKey] : [] };
  }
  return { ...DEFAULT_CAM_FILTER, tags: [category.slug] };
}

/** Add or remove one value from a facet. */
export function toggleFilter<F extends keyof CamFilterState>(
  state: CamFilterState,
  facet: F,
  value: CamFilterState[F][number],
): CamFilterState {
  const current = state[facet] as string[];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return normalizeFilter({ ...state, [facet]: next } as CamFilterState);
}

// ── URL <-> state ─────────────────────────────────────────────────────────────
//
// The external grammar is deliberately human-readable: full-word parameter names and the same
// words the category pages use as slugs, joined with literal commas —
//   /live-sex/?site=chaturbate&gender=female,couples&tags=milf,teen&language=german
// (language values are the canonical english keys from lib/cams/languages.ts, not autonyms)
// never single-letter params or percent-encoded separators. Values are validated slugs
// ([a-z0-9-] plus the comma join), so the query is assembled by hand instead of through
// URLSearchParams, which would encode every comma as %2C.

/** URL words for the internal gender keys — identical to the gender category slugs. */
export const GENDER_WORDS: Record<CamGender, string> = { f: 'female', m: 'male', c: 'couples', t: 'trans' };
/** URL words for the provider keys — the same slugs model URLs use (types.ts owns them). */
export const PROVIDER_WORDS: Record<CamProvider, string> = CAM_PROVIDER_SLUGS;

const WORD_TO_GENDER = new Map((Object.entries(GENDER_WORDS) as [CamGender, string][]).map(([k, w]) => [w, k]));
const WORD_TO_PROVIDER = new Map((Object.entries(PROVIDER_WORDS) as [CamProvider, string][]).map(([k, w]) => [w, k]));

function filterToParams(
  state: CamFilterState,
  extra: { sort?: string; page?: number; favorites?: boolean } = {},
): string {
  const n = normalizeFilter(state);
  const parts: string[] = [];
  if (n.providers.length) parts.push(`site=${n.providers.map((p) => PROVIDER_WORDS[p]).join(',')}`);
  if (n.genders.length) parts.push(`gender=${n.genders.map((g) => GENDER_WORDS[g]).join(',')}`);
  if (n.tags.length) parts.push(`tags=${n.tags.join(',')}`);
  if (n.languages.length) parts.push(`language=${n.languages.join(',')}`);
  if (extra.sort === 'new') parts.push('sort=new');
  // Per-user view — only the (dynamic) filter route can honor it, never a canonical page.
  if (extra.favorites) parts.push('fav=1');
  if (extra.page && extra.page > 1) parts.push(`page=${extra.page}`);
  return parts.join('&');
}

const split = (v: string | undefined): string[] =>
  (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 20);

/**
 * Read a state out of query params. Every value is validated — this is a public URL, and an
 * unknown slug must simply not select anything rather than reach the query layer.
 */
export function filterFromParams(
  params: { site?: string; gender?: string; tags?: string; language?: string },
  knownTagSlugs: ReadonlySet<string>,
): CamFilterState {
  return normalizeFilter({
    providers: split(params.site)
      .map((w) => WORD_TO_PROVIDER.get(w))
      .filter((p): p is CamProvider => Boolean(p)),
    genders: split(params.gender)
      .map((w) => WORD_TO_GENDER.get(w))
      .filter((g): g is CamGender => Boolean(g)),
    tags: split(params.tags).filter((slug) => knownTagSlugs.has(slug)),
    languages: split(params.language).filter(isCamLanguage),
  });
}

/**
 * THE link builder for a browse state: the canonical static path when one exists, the dynamic
 * filter route otherwise. Everything that renders a filter control goes through this, so a
 * selection that happens to match an indexable page always lands on it.
 */
/**
 * stateKey → canonical category slug, computed once per categories array. A render of the
 * filter rail + list controls calls camFilterUrl for every link (~40), and each used to scan
 * all categories with two normalize+serialize passes per comparison — O(links × categories)
 * throwaway allocations on the one route that renders per request. The WeakMap keys on the
 * array identity, which all links in a render share.
 */
const canonicalSlugs = new WeakMap<CategoryLike[], Map<string, string>>();
function canonicalSlugFor(state: CamFilterState, categories: CategoryLike[]): string | undefined {
  let map = canonicalSlugs.get(categories);
  if (!map) {
    map = new Map(categories.map((c) => [key(seedFilterFor(c)), c.slug]));
    canonicalSlugs.set(categories, map);
  }
  return map.get(key(state));
}

export function camFilterUrl(
  state: CamFilterState,
  categories: CategoryLike[],
  extra: { sort?: string; page?: number; favorites?: boolean } = {},
): string {
  // Canonical paths can express neither a sort nor the per-user favorites view, so either one
  // goes to the filter route as a parameter — regardless of how canonical the selection is.
  if (extra.sort !== 'new' && !extra.favorites) {
    // The default is checked FIRST on purpose. The hub and the "female" category describe the
    // same selection, and the hub is the canonical home for it — testing categories first would
    // send every "unselect back to the default" click to /live-sex/female/ instead of /live-sex/.
    if (isDefaultFilter(state)) {
      return camListPath({ page: extra.page ?? 1 });
    }
    const canonical = canonicalSlugFor(state, categories);
    if (canonical) {
      return camListPath({ categorySlug: canonical, page: extra.page ?? 1 });
    }
  }
  const qs = filterToParams(state, extra);
  return qs ? `${CAM_FILTER_EXTERNAL}?${qs}` : CAM_FILTER_EXTERNAL;
}
