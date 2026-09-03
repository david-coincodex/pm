import type { CamModel } from './types';
import type { CamCategory } from './categories';
import { modelMatchesCategory } from './categories';
import type { OnlineSnapshot } from './registry';
import { normalizeFilter, type CamFilterState } from './filters';
import { languageForCountry } from './languages';

/**
 * Querying over the in-memory snapshot. Both sort orders are precomputed once per refresh
 * (see registry.ts), so a listing is: pick the pre-sorted array → one linear category pass →
 * slice. No page ever sorts the full set.
 *
 * Category results are memoized per snapshot version, so the 20 pages of /live-sex/big-tits/
 * and its metadata all share a single filter pass.
 */

export type CamSort = 'viewers' | 'new';

/** 48 = whole rows at every breakpoint (2/3/4/6 columns) and ~200 KB of HTML per page. */
export const CAM_PAGE_SIZE = 48;
/** Deep pages of a set that turns over every minute are noise; cap the crawlable depth. */
export const CAM_MAX_PAGE = 40;

const derived = new Map<string, CamModel[]>();
let derivedVersion = '';
/**
 * Hard cap on memoized selections per snapshot window. The canonical pages produce a couple
 * dozen keys — but /live-sex/filter/ accepts arbitrary facet combinations, so an adversarial
 * crawl could otherwise pile thousands of result arrays in here between refreshes. Past the
 * cap, selections still compute (one linear pass over ~3k models), they just aren't stored.
 */
const MEMO_MAX = 200;

function memo(snapshot: OnlineSnapshot, key: string, build: () => CamModel[]): CamModel[] {
  if (derivedVersion !== snapshot.version) {
    derived.clear();
    derivedVersion = snapshot.version;
  }
  const hit = derived.get(key);
  if (hit) return hit;
  const value = build();
  if (derived.size < MEMO_MAX) derived.set(key, value);
  return value;
}

/**
 * The models for a multi-select browse state. OR within a facet, AND across facets: an empty
 * facet means "no constraint", so {genders:['f'], providers:['cb']} is "women on Chaturbate".
 *
 * One linear pass over an already-sorted array, memoized per snapshot so every page of the same
 * selection — and its metadata — shares the work.
 */
export function selectByFilter(
  snapshot: OnlineSnapshot,
  state: CamFilterState,
  categories: CamCategory[],
  sort: CamSort,
): CamModel[] {
  const f = normalizeFilter(state);
  const base = sort === 'new' ? snapshot.byNewest : snapshot.byViewers;
  if (f.providers.length === 0 && f.genders.length === 0 && f.tags.length === 0 && f.languages.length === 0) return base;

  const cacheKey = `filter:${f.providers}|${f.genders}|${f.tags}|${f.languages}|${sort}`;
  return memo(snapshot, cacheKey, () => {
    const tagCategories = categories.filter((c) => c.kind === 'tag' && f.tags.includes(c.slug));
    return base.filter((m) => {
      if (f.providers.length && !f.providers.includes(m.provider)) return false;
      if (f.genders.length && !f.genders.includes(m.gender)) return false;
      // Language matches by COUNTRY (user decision): "Deutsch" = models from German-speaking
      // countries, so the card flags always agree with the filter. Models without a country
      // can't match any language — accepted cost (~40% of CB rooms carry none).
      if (f.languages.length) {
        const countryLanguage = m.country ? languageForCountry(m.country) : null;
        if (!countryLanguage || !f.languages.includes(countryLanguage)) return false;
      }
      if (tagCategories.length && !tagCategories.some((c) => modelMatchesCategory(m, c))) return false;
      return true;
    });
  });
}

export function countByFilter(snapshot: OnlineSnapshot, state: CamFilterState, categories: CamCategory[]): number {
  return selectByFilter(snapshot, state, categories, 'viewers').length;
}

/**
 * The "Next" cam from a model page: same gender ALWAYS (a viewer watching women is never sent
 * to a male room), preferring rooms that share a tag, walking DOWN the viewer ladder — the
 * next candidate is the most-viewed room below the current one, wrapping to the top when the
 * ladder is exhausted. Descending instead of "highest first" avoids ping-ponging between the
 * same two top rooms on repeated clicks.
 *
 * `matchTags` is the tag set to compare on, and callers should pass the CROSS-PROVIDER subset
 * (see crossProviderTags in lib/cams/categories): a provider's private vocabulary otherwise
 * acts as a provider marker and "Next" keeps landing on the same cam site. Defaults to the
 * model's own tags for callers with no category list to hand.
 */
export function pickNextModel(
  snapshot: OnlineSnapshot,
  current: CamModel,
  matchTags: string[] = current.tags,
): CamModel | null {
  const sameGender = snapshot.byViewers.filter((m) => m.gender === current.gender && m.id !== current.id);
  if (sameGender.length === 0) return null;
  const tagged = matchTags.length ? sameGender.filter((m) => m.tags.some((t) => matchTags.includes(t))) : [];
  const pool = tagged.length ? tagged : sameGender;
  return pool.find((m) => m.viewers < current.viewers) ?? pool[0];
}

export type CamPage = {
  items: CamModel[];
  total: number;
  totalPages: number;
  page: number;
};

export function paginate(models: CamModel[], page: number): CamPage {
  const totalPages = Math.max(1, Math.min(Math.ceil(models.length / CAM_PAGE_SIZE), CAM_MAX_PAGE));
  const p = Math.max(1, Math.min(page, totalPages));
  const start = (p - 1) * CAM_PAGE_SIZE;
  return {
    items: models.slice(start, start + CAM_PAGE_SIZE),
    total: models.length,
    totalPages,
    page: p,
  };
}
