import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { siteSettings } from '@/lib/siteSettings';
import { routes } from '@/lib/routes';
import { getOnlineModels } from '@/lib/cams/registry';
import { getUser, getFavorites } from '@/lib/auth';
import { getCamCategories } from '@/lib/cams/categories';
import { selectByFilter, countByFilter, paginate, CAM_MAX_PAGE, type CamSort } from '@/lib/cams/query';
import { filterFromParams, camFilterUrl } from '@/lib/cams/filters';
import CamBrowseShell from '@/components/cams/CamBrowseShell';
import CamModelCard from '@/components/cams/CamModelCard';
import CamFavoritesStrip from '@/components/cams/CamFavoritesStrip';
import { CamGrid } from '@/components/cams/CamGrid';
import Pagination from '@/components/Pagination';
import SectionTitle from '@/components/SectionTitle';
import Breadcrumbs from '@/components/Breadcrumbs';
import CamListControls from '@/components/cams/CamListControls';
import CamFilterRail from '@/components/cams/CamFilterRail';
import CamLiveBadge from '@/components/cams/CamLiveBadge';
import PaginationScrollAnchor from '@/components/PaginationScrollAnchor';
import { compactNumber } from '@/lib/format';
import { Link, getPathname } from '@/i18n/navigation';

/**
 * Listings for arbitrary filter combinations — "women and couples on Chaturbate tagged Teen".
 *
 * Combinations are unbounded, so this route is the one place in /live-sex/ that renders per
 * request instead of being prerendered. That is a deliberate split, not a regression: the
 * single-facet pages people arrive on from search stay static and instant, while the long tail
 * of ad-hoc selections is served from the same in-memory snapshot in a few milliseconds.
 *
 * Every one of these views is a duplicate of content already reachable through the canonical
 * pages, so the route is robots-disallowed and every state canonicals to the hub — it exists
 * for humans clicking boxes, not for crawlers enumerating a combinatorial space.
 */

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ site?: string; gender?: string; tags?: string; language?: string; sort?: string; page?: string; fav?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'liveSex' });
  return {
    title: t('filterMetaTitle'),
    // No robots directive: every filtered state canonicals to the hub (user decision) —
    // noindex + canonical-elsewhere would be conflicting signals.
    alternates: { canonical: `${siteSettings.baseUrl}${routes.liveSex()}` },
  };
}

export default async function CamFilterPage({ params, searchParams }: Props) {
  if (!siteSettings.features.liveSex) notFound();
  const { locale } = await params;
  const sp = await searchParams;

  const [t, tAccount, categories, snapshot] = await Promise.all([
    getTranslations({ locale, namespace: 'liveSex' }),
    getTranslations({ locale, namespace: 'account' }),
    getCamCategories(),
    getOnlineModels(),
  ]);

  const tagSlugs = new Set(categories.filter((c) => c.kind === 'tag').map((c) => c.slug));
  const state = filterFromParams(sp, tagSlugs);
  const sort: CamSort = sp.sort === 'new' ? 'new' : 'viewers';
  // fav=1 needs the account system; while accounts are off the param is inert.
  const favoritesView = siteSettings.features.accounts && sp.fav === '1';
  const requestedPage = Math.max(1, Math.min(Number(sp.page) || 1, CAM_MAX_PAGE));

  // The favorites view is per-user (cookie), which this route can afford — it renders per
  // request anyway. The intersection is applied AFTER the shared memoized selection so the
  // per-user result never enters the shared cache.
  const [user, favoriteRows] = favoritesView ? await Promise.all([getUser(), getFavorites()]) : [null, []];
  let models = selectByFilter(snapshot, state, categories, sort);
  if (favoritesView) {
    const favoriteIds = new Set(favoriteRows.map((f) => `${f.provider}:${f.username}`));
    models = models.filter((m) => favoriteIds.has(m.id));
  }
  const { items, total, totalPages, page } = paginate(models, requestedPage);
  const tagCounts = Object.fromEntries(
    categories
      .filter((c) => c.kind === 'tag')
      .map((c) => [c.slug, countByFilter(snapshot, { ...state, tags: [c.slug] }, categories)]),
  );

  return (
    <>
      <Breadcrumbs
        locale={locale}
        width="full"
        crumbs={[
          { label: t('breadcrumb'), href: routes.liveSex() },
          { label: t('filteredCrumb'), href: routes.liveSex() },
        ]}
      />
      <CamBrowseShell
        rail={
          <CamFilterRail
            categories={categories}
            state={state}
            sort={sort}
            favoritesActive={favoritesView}
            tagCounts={tagCounts}
          />
        }
      >
        {snapshot.degradedProviders.length > 0 && (
          <p className="mb-3 text-sm text-amber-600 dark:text-amber-400">{t('degradedNotice')}</p>
        )}

        <CamFavoritesStrip title={tAccount('onlineNow')} />

        <PaginationScrollAnchor page={page} scope="filter" />
        <section data-snapshot-at={snapshot.fetchedAt}>
          <SectionTitle
            as="h1"
            title={t('matchingCams')}
            badge={<CamLiveBadge className="hidden sm:flex">{t('liveCount', { count: compactNumber(total, locale) })}</CamLiveBadge>}
            actionsBelowOnMobile
            actions={
              <CamListControls
                state={state}
                categories={categories}
                sort={sort}
                favoritesActive={favoritesView}
                filters={
                  <CamFilterRail
                    categories={categories}
                    state={state}
                    sort={sort}
                    favoritesActive={favoritesView}
                    tagCounts={tagCounts}
                  />
                }
              />
            }
          />
          {favoritesView && !user ? (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              {t('favoritesLoginHint')}{' '}
              <Link href={routes.login()} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                {tAccount('signIn')}
              </Link>
            </p>
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              {t('noModels')}
            </p>
          ) : (
            <CamGrid>
              {items.map((m, i) => (
                <CamModelCard key={m.id} model={m} priority={page === 1 && i < 6} />
              ))}
            </CamGrid>
          )}
          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              hrefFor={(p) =>
                getPathname({ href: camFilterUrl(state, categories, { sort, page: p, favorites: favoritesView || undefined }), locale })
              }
            />
          )}
        </section>
      </CamBrowseShell>
    </>
  );
}
