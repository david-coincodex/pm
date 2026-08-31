import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { siteSettings } from '@/lib/siteSettings';
import { routes } from '@/lib/routes';
import { getOnlineModels } from '@/lib/cams/registry';
import { getCamCategories } from '@/lib/cams/categories';
import { selectByFilter, countByFilter, paginate } from '@/lib/cams/query';
import { seedFilterFor, isDefaultFilter, camCategoryPath } from '@/lib/cams/filters';
import { camListPath, parseCamListPath, type CamListRoute } from '@/lib/cams/urls';
import { compactNumber } from '@/lib/format';
import { localizedPath, paginatedAlternates, paginatedNavLinks, paginatedTitle } from '@/lib/pagination';
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
import FaqSection from '@/components/FaqSection';
import RichText from '@/components/RichText';

/**
 * EVERY cam listing: the hub, cam sites, genders, tag categories, each sort and each page —
 * one component, because they differ only in which slice of the snapshot they show.
 *
 * The route is deliberately free of searchParams and cookies, which is what lets Next render
 * it statically and revalidate in the background: visitors are served finished HTML from the
 * route cache while the 60 s refresh happens off the request path. The two per-visitor pieces
 * (the favorites strip, the hearts) hydrate on the client instead — see CamFavoritesStrip.
 */

type Props = { params: Promise<{ locale: string; path?: string[] }> };

/**
 * Live inventory: cache briefly, refresh often. Paired with `expireTime: 60` in next.config.ts,
 * which caps how long a stale copy may be served — without that cap a quiet page can sit in the
 * cache for as long as Next likes, and this number means nothing.
 */
export const revalidate = 30;

/**
 * Prerender the hub and every category at build time when Strapi is reachable; when it is not
 * (the Docker image builds without a backend), fall back to generating on first request. Both
 * paths end in the same cached output — this only decides who pays for the first render.
 */
export async function generateStaticParams(): Promise<{ path?: string[] }[]> {
  if (!siteSettings.features.liveSex) return [];
  try {
    const categories = await getCamCategories();
    return [
      { path: [] },
      ...categories.filter((c) => !isDefaultFilter(seedFilterFor(c))).map((c) => ({ path: [c.slug] })),
    ];
  } catch {
    return [];
  }
}

/** Resolve the URL into the listing it describes, or 404. */
async function resolve(path: string[] | undefined) {
  const route = parseCamListPath(path);
  if (!route) notFound();
  const categories = await getCamCategories();
  const category = route.categorySlug ? (categories.find((c) => c.slug === route.categorySlug) ?? null) : null;
  if (route.categorySlug && !category) notFound();
  return { route, categories, category };
}

/**
 * Canonical for one listing: self-canonical in the sitewide ?page= form (user decision —
 * paginated pages are canonical, carrying rel=prev/next rendered by the page body).
 */
function listingAlternates(route: CamListRoute, locale: string, isDefaultView = false): Metadata {
  // A category whose selection IS the default (the "female" page, since the hub defaults to
  // women) shows exactly what the hub shows — point it there rather than compete with it.
  const basePath = camListPath({ categorySlug: isDefaultView ? undefined : route.categorySlug });
  return { alternates: paginatedAlternates(basePath, route.page, locale) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, path } = await params;
  if (!siteSettings.features.liveSex) return {};
  // Same resolution the page runs — notFound() works in generateMetadata, so a bad URL 404s
  // here identically instead of shipping empty metadata for a page that then 404s anyway.
  const { route, categories, category } = await resolve(path);

  const t = await getTranslations({ locale, namespace: 'liveSex' });
  const snapshot = await getOnlineModels();
  const count = countByFilter(snapshot, seedFilterFor(category), categories);
  const baseTitle = category ? t('categoryMetaTitle', { name: category.name }) : t('metaTitle');

  return {
    title: paginatedTitle(baseTitle, route.page),
    description: category ? t('categoryMetaDescription', { name: category.name, count }) : t('metaDescription'),
    ...listingAlternates(route, locale, Boolean(category) && isDefaultFilter(seedFilterFor(category))),
  };
}

export default async function CamListingPage({ params }: Props) {
  if (!siteSettings.features.liveSex) notFound();
  const { locale, path } = await params;
  // Without this, next-intl reads request headers and the route silently goes dynamic.
  setRequestLocale(locale);

  const { route, categories, category } = await resolve(path);

  // The category duplicating the hub's default view (female) has NO page of its own: nothing
  // links it (camCategoryPath sends every surface to the hub), it is absent from the sitemap
  // and generateStaticParams, and the URL 404s — one view, one URL, no redirect to maintain.
  if (category && isDefaultFilter(seedFilterFor(category))) notFound();

  const [t, tAccount, snapshot] = await Promise.all([
    getTranslations({ locale, namespace: 'liveSex' }),
    getTranslations({ locale, namespace: 'account' }),
    getOnlineModels(),
  ]);

  // Each canonical page is one point in the filter space — the hub is "women", a platform page
  // is "women on that platform" — so the rail can show it with the right boxes ticked and let
  // the visitor widen or narrow from there.
  const state = seedFilterFor(category);

  const base = selectByFilter(snapshot, state, categories, 'viewers');
  // Per-tag inventory under this page's selection — the rail hides tags nothing matches
  // (what "MILF" means under Male is: nothing). Each count is a memoized snapshot pass.
  const tagCounts = Object.fromEntries(
    categories
      .filter((c) => c.kind === 'tag')
      .map((c) => [c.slug, countByFilter(snapshot, { ...state, tags: [c.slug] }, categories)]),
  );

  const { items: gridItems, totalPages, page } = paginate(base, route.page);
  if (page !== route.page) notFound(); // e.g. /page/9/ of a 3-page category


  // The H1 stays the clean listing name on every page — the page number belongs to the
  // <title> (paginatedTitle in generateMetadata) and the pagination bar, not the heading.
  const title = category ? t('categoryTitle', { name: category.name }) : t('title');
  const listBasePath = localizedPath(camListPath({ categorySlug: route.categorySlug }), locale);
  const { prevHref, nextHref } = paginatedNavLinks(listBasePath, page, totalPages);

  return (
    <>
      {/* rel=prev/next, the sitewide pattern (React hoists these into <head>). */}
      {prevHref && <link rel="prev" href={prevHref} />}
      {nextHref && <link rel="next" href={nextHref} />}
      {/* The first card's thumbnail IS the LCP candidate: preloading it from the head starts
          the fetch during HTML parse instead of after CSS/layout — measured worth ~2s of
          simulated mobile LCP. One image only; the rest of the row is already eager. */}
      {gridItems[0]?.thumbUrl && page === 1 && (
        <link rel="preload" as="image" href={gridItems[0].thumbUrl} fetchPriority="high" />
      )}
      <Breadcrumbs
        locale={locale}
        width="full"
        crumbs={[
          { label: t('breadcrumb'), href: routes.liveSex() },
          ...(category ? [{ label: category.name, href: camCategoryPath(category) }] : []),
        ]}
      />
      <CamBrowseShell rail={<CamFilterRail categories={categories} state={state} tagCounts={tagCounts} />}>
        {snapshot.degradedProviders.length > 0 && (
          <p className="mb-3 text-sm text-amber-600 dark:text-amber-400">{t('degradedNotice')}</p>
        )}

        {/* Client-rendered: it is the only per-visitor block, and keeping it off the server
            render is what keeps this whole route statically cacheable. */}
        <CamFavoritesStrip title={tAccount('onlineNow')} />

        {/* Query-only navigation (?page=) never scrolls by itself — the sitewide anchor
            every paginated listing pairs with <Pagination>. */}
        <PaginationScrollAnchor page={page} scope={route.categorySlug ?? 'hub'} />
        {/* data-snapshot-at: when the models below were fetched from the providers — the
            first thing to check whenever this page is suspected of showing stale data. */}
        <section data-snapshot-at={snapshot.fetchedAt}>
          <SectionTitle
            as="h1"
            title={title}
            badge={<CamLiveBadge className="hidden sm:flex">{t('liveCount', { count: compactNumber(base.length, locale) })}</CamLiveBadge>}
            actionsBelowOnMobile
            actions={
              <CamListControls
                state={state}
                categories={categories}
                filters={<CamFilterRail categories={categories} state={state} tagCounts={tagCounts} />}
              />
            }
          />
          {category?.intro && page === 1 && <RichText content={category.intro} locale={locale} className="-mt-4 mb-6" />}
          {gridItems.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              {t('noModels')}
            </p>
          ) : (
            <CamGrid>
              {gridItems.map((m, i) => (
                <CamModelCard key={m.id} model={m} priority={page === 1 && i < 6} />
              ))}
            </CamGrid>
          )}
          {totalPages > 1 && (
            /* External pagination is the sitewide ?page= form now — the DEFAULT href builder.
               basePath is locale-prefixed because Pagination renders plain next/link. */
            <Pagination currentPage={page} totalPages={totalPages} basePath={listBasePath} />
          )}
        </section>


        {/* Long-form copy and FAQs belong to the canonical page-1 view only. */}
        {page === 1 && category?.content && <RichText content={category.content} locale={locale} className="mt-10" />}
        {page === 1 && <FaqSection faqs={category?.faqs ?? []} bare />}
      </CamBrowseShell>
    </>
  );
}

/** Categories added in Strapi after a build must still render — generate them on demand. */
export const dynamicParams = true;
