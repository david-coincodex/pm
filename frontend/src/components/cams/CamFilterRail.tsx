import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CAM_PROVIDER_NAMES, type CamGender, type CamProvider } from '@/lib/cams/types';
import { camFilterUrl, toggleFilter, isDefaultFilter, DEFAULT_CAM_FILTER, type CamFilterState } from '@/lib/cams/filters';
import { LANGUAGE_FLAGS, languageLabel } from '@/lib/cams/languages';
import type { CamSort } from '@/lib/cams/query';
import type { CamCategory } from '@/lib/cams/categories';
import CamLanguageGroup from './CamLanguageGroup';
import FilterCheckRow from './FilterCheckRow';

interface Props {
  categories: CamCategory[];
  /** The selection this page represents. */
  state: CamFilterState;
  sort?: CamSort;
  /** True when the per-user favorites view is active (filter route, ?fav=1). */
  favoritesActive?: boolean;
  /** Live model count per tag slug UNDER THE CURRENT selection — tags at zero are hidden
   * (a "MILF" box that matches nothing under Male just teaches dead ends). */
  tagCounts?: Record<string, number>;
}

/**
 * The browse filters. Cam site, model type and language are DROPDOWNS (native `<details>` —
 * works without JS, and every option stays a real crawlable link) whose summary shows the
 * current choice; tag categories stay an always-visible checkbox list. Sorting lives beside
 * the listing title (CamListControls), not here.
 *
 * Every control is a LINK to the URL that selection produces, not an input wired to client
 * state. That single decision buys a lot: the filters work with JS disabled, each combination
 * is a real URL you can share or open in a new tab, the back button behaves, and — because
 * camFilterUrl sends single-facet selections to their canonical path — clicking one platform
 * lands on the prerendered /live-sex/chaturbate/ rather than a query string.
 *
 * Server component: what is checked comes from the URL, so there is no state to hydrate.
 */
export default function CamFilterRail({ categories, state, sort = 'viewers', favoritesActive = false, tagCounts }: Props) {
  const t = useTranslations('liveSex');

  const genderLabels: Record<CamGender, string> = {
    f: t('genderFemale'),
    m: t('genderMale'),
    c: t('genderCouples'),
    t: t('genderTrans'),
  };

  const providers = categories.filter((c) => c.kind === 'provider' && c.providerKey);
  const languages = categories.filter((c) => c.kind === 'language' && c.languageKey);
  const tags = categories.filter(
    (c) => c.kind === 'tag' && (state.tags.includes(c.slug) || !tagCounts || (tagCounts[c.slug] ?? 0) > 0),
  );
  const genders = categories.filter((c) => c.kind === 'gender' && c.genderKey);

  const extra = { sort, favorites: favoritesActive || undefined };

  // The shared row renderers — same component as the client-side language group.
  const row = (checked: boolean, href: string, label: string, meta?: string) => (
    <li key={href + label}>
      <FilterCheckRow href={href} checked={checked} label={label} meta={meta} />
    </li>
  );
  const radioRow = (checked: boolean, href: string, label: string) => (
    <li key={href + label}>
      <FilterCheckRow href={href} checked={checked} label={label} variant="radio" />
    </li>
  );

  /** One dropdown group: a `<details>` whose summary carries the group name + current pick. */
  const dropdown = (label: string, current: string, body: React.ReactNode) => (
    <details className="group rounded-xl border border-slate-200 dark:border-slate-700">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
          <span className="truncate font-semibold text-slate-800 dark:text-slate-100">{current}</span>
        </span>
        <svg
          className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="border-t border-slate-200 px-1 py-1.5 dark:border-slate-700">{body}</div>
    </details>
  );

  const currentSite =
    state.providers.length === 1 ? (CAM_PROVIDER_NAMES[state.providers[0]] ?? state.providers[0]) : t('allSites');
  const currentGender = state.genders.length === 1 ? (genderLabels[state.genders[0]] ?? '') : t('showEveryone');
  const currentLanguage = state.languages.length === 1 ? languageLabel(state.languages[0]) : t('allLanguages');

  // Anything off the default view (facets, sort, favorites) earns the reset link. It goes to
  // the hub — the canonical home of the default view — never to a query URL.
  const isDefaultView = isDefaultFilter(state) && sort === 'viewers' && !favoritesActive;

  return (
    <nav aria-label={t('filters')} className="space-y-3">
      {/* Column title, same chrome as "Streaming on"/"Live Sex Deals" — with the reset action
          beside it ("Reset" suffices; the word "Filters" is already right there). */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {t('filters')}
        </p>
        {!isDefaultView && (
          <Link
            href={camFilterUrl(DEFAULT_CAM_FILTER, categories)}
            className="text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            {t('reset')}
          </Link>
        )}
      </div>
      {dropdown(
        t('camSites'),
        currentSite,
        <ul className="space-y-0.5">
          {/* Radio: one site or all — "all" clears the facet. */}
          {radioRow(state.providers.length === 0, camFilterUrl({ ...state, providers: [] }, categories, extra), t('allSites'))}
          {providers.map((c) =>
            radioRow(
              state.providers.length === 1 && state.providers[0] === c.providerKey,
              camFilterUrl({ ...state, providers: [c.providerKey as CamProvider] }, categories, extra),
              CAM_PROVIDER_NAMES[c.providerKey as CamProvider] ?? c.name,
            ),
          )}
        </ul>,
      )}

      {dropdown(
        t('modelType'),
        currentGender,
        <ul className="space-y-0.5">
          {/* Radio: exactly one model type at a time (the default view is Female). */}
          {genders.map((c) =>
            radioRow(
              state.genders.length === 1 && state.genders[0] === c.genderKey,
              camFilterUrl({ ...state, genders: [c.genderKey as CamGender] }, categories, extra),
              genderLabels[c.genderKey as CamGender] ?? c.name,
            ),
          )}
        </ul>,
      )}

      {languages.length > 0 &&
        dropdown(
          t('language'),
          currentLanguage,
          /* Radio rows from the Strapi language categories, each wearing its country flag —
             the filter matches by country, so the flag is the truthful symbol. Hrefs are
             built HERE (server, canonical-aware); the client group only reorders by geo. */
          <CamLanguageGroup
            rows={[
              {
                key: '__all',
                label: t('allLanguages'),
                checked: state.languages.length === 0,
                href: camFilterUrl({ ...state, languages: [] }, categories, extra),
              },
              ...languages.map((c) => ({
                key: c.languageKey as string,
                label: c.name,
                flag: LANGUAGE_FLAGS[c.languageKey as string],
                checked: state.languages.length === 1 && state.languages[0] === c.languageKey,
                href: camFilterUrl({ ...state, languages: [c.languageKey as string] }, categories, extra),
              })),
            ]}
          />,
        )}

      {/* Same box chrome as the dropdowns, but always open: tags are the browse surface. */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700">
        {/* Styled as a heading but a <p>: the rail renders before the page's H1 in DOM
            order, and a leading h3 would break the document's heading outline. */}
        <p className="border-b border-slate-200 px-3 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:border-slate-700 dark:text-slate-500">
          {t('categories')}
        </p>
        <ul className="space-y-0.5 px-1 py-1.5">
          {tags.map((c) =>
            row(
              state.tags.includes(c.slug),
              camFilterUrl(toggleFilter(state, 'tags', c.slug), categories, extra),
              c.name,
              tagCounts ? String(tagCounts[c.slug] ?? 0) : undefined,
            ),
          )}
        </ul>
      </section>

    </nav>
  );
}

export { DEFAULT_CAM_FILTER };
