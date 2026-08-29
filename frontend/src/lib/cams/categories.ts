import 'server-only';
import { strapiGet, type Faq, type Site, type StrapiMedia } from '@/lib/strapi';
import { enabledProviders } from './registry';
import { languageForCountry } from './languages';
import type { CamGender, CamModel, CamProvider } from './types';

/**
 * Cam categories are the ONE persisted piece of the aggregator: content-team-editable rows
 * (SEO copy, FAQs, tag synonyms) that ride the normal content push. Genders, tag categories
 * AND cam sites are a single type — `kind` decides how a category matches live models. Cam
 * sites being categories is what gives /live-sex/chaturbate/ an indexable URL with its own
 * intro copy and FAQs instead of a `?provider=` query string.
 */
export type CamCategory = {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  kind: 'gender' | 'tag' | 'provider' | 'language';
  genderKey: CamGender | null;
  providerKey: CamProvider | null;
  /** Language pages match by COUNTRY (user decision — flags must agree with the page). */
  languageKey: string | null;
  /** Lowercased tag synonyms, e.g. ["big tits","bigtits","big boobs"]. */
  matchTags: string[] | null;
  intro: string | null;
  content: string | null;
  cover_image: StrapiMedia | null;
  faqs: Faq[];
  featured: boolean;
  sortOrder: number;
  /** Provider categories only: the Strapi camsite entry, for offers on model pages. */
  site: Site | null;
};

export async function getCamCategories(): Promise<CamCategory[]> {
  const res = await strapiGet<CamCategory[]>(
    // Object-style populate throughout: mixing array-style with the nested site populate would
    // make Strapi silently drop the array entries (see SITE_CARD_FIELDS notes in lib/strapi.ts).
    '/cam-categories?populate[faqs]=true&populate[cover_image]=true' +
      '&populate[site][fields]=name,slug,url,isActive,short_description,siteType' +
      '&populate[site][populate][offers]=true&populate[site][populate][logo]=true&populate[site][populate][cover_image]=true' +
      '&sort[0]=sortOrder:asc&sort[1]=name:asc&pagination[pageSize]=100',
    { next: { revalidate: 300 } },
  );
  // A cam-site category whose feed is switched off would render an empty page, sit in the
  // sitemap and take a rail slot. Drop it here, once, so every consumer agrees it isn't there.
  return res.data.filter((c) => c.kind !== 'provider' || (c.providerKey !== null && enabledProviders.has(c.providerKey)));
}

export async function getCamCategoryBySlug(slug: string): Promise<CamCategory | null> {
  const all = await getCamCategories(); // one cached fetch serves every category page
  return all.find((c) => c.slug === slug) ?? null;
}

/** Does a live model belong to a category? */
export function modelMatchesCategory(model: CamModel, category: CamCategory): boolean {
  if (category.kind === 'gender') return category.genderKey !== null && model.gender === category.genderKey;
  if (category.kind === 'provider') return category.providerKey !== null && model.provider === category.providerKey;
  if (category.kind === 'language') {
    return category.languageKey !== null && !!model.country && languageForCountry(model.country) === category.languageKey;
  }
  const wanted = category.matchTags ?? [];
  if (wanted.length === 0) return false;
  return model.tags.some((t) => wanted.includes(t));
}

/** Categories a model belongs to — powers the tag links on model pages. */
export function categoriesForModel(model: CamModel, categories: CamCategory[]): CamCategory[] {
  return categories.filter((c) => modelMatchesCategory(model, c));
}
