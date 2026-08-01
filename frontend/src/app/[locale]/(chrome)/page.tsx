import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSitesWithDealsPaginated, getFeaturedDeals, getLifetimeDeals, getSitesByCategoryId, getPublishedBundles, getDiscountPercent, getMaxDiscountPercent } from "@/lib/strapi";
import type { Bundle, Featured, Site } from "@/lib/strapi";
import { parsePage, paginatedAlternates, paginatedNavLinks, paginatedTitle } from "@/lib/pagination";
import Container from "@/components/Container";
import SiteCardGrid from "@/components/site/SiteCardGrid";
import Pagination from "@/components/Pagination";
import PaginationScrollAnchor from "@/components/PaginationScrollAnchor";
import SiteCardRow from "@/components/site/SiteCardRow";
import FeaturedHeader from "@/components/FeaturedHeader";
import CategorySpotlight from "@/components/CategorySpotlight";
import SiteBundlesSection from "@/components/site/SiteBundlesSection";
import CategoryGrid from "@/components/CategoryGrid";
import LatestArticles from "@/components/LatestArticles";
import SectionTitle from "@/components/SectionTitle";
import { routes } from "@/lib/routes";
import { siteSettings } from "@/lib/siteSettings";

const PAGE_SIZE = 12;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const t = await getTranslations({ locale, namespace: "pageSEO" });
  const page = parsePage(pageStr);

  return {
    title: paginatedTitle(t("sites.metaTitle"), page),
    alternates: paginatedAlternates(routes.home(), page, locale),
  };
}

export default async function Home({ params, searchParams }: Props) {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const t = await getTranslations({ locale, namespace: "sites" });
  const tSeo = await getTranslations({ locale, namespace: "pageSEO" });

  const page = parsePage(pageStr);
  const basePath = routes.home();

  // All five reads fire together — they have no interdependencies, and running them
  // sequentially cost ~5 serial Strapi round trips before the first byte.
  // Each .catch() stays *inside* Promise.all: it rejects on the first failure, so a
  // single Strapi hiccup would otherwise 500 the whole homepage.
  const firstPage = page === 1;
  const [listing, featuredDeals, lifetimeSites, camSites, bundles] = await Promise.all([
    getSitesWithDealsPaginated(page, PAGE_SIZE).catch(() => ({
      sites: [],
      pagination: { page: 1, pageSize: PAGE_SIZE, pageCount: 1, total: 0 },
    })),
    firstPage ? getFeaturedDeals().catch(() => []) : Promise.resolve<Featured[]>([]),
    firstPage ? getLifetimeDeals(4).catch(() => []) : Promise.resolve<Site[]>([]),
    firstPage
      ? getSitesByCategoryId(siteSettings.CAM_CATEGORY_ID, 1, 4).then((r) => r.sites).catch(() => [])
      : Promise.resolve<Site[]>([]),
    firstPage ? getPublishedBundles(3).catch(() => []) : Promise.resolve<Bundle[]>([]),
  ]);

  const { sites, pagination } = listing;

  // Featured row — only on page 1
  const featuredItems = featuredDeals
    .filter((d) => d.site)
    .map((d) => {
      const activeOffers = (d.site.offers ?? []).filter((o) => o.isActive);
      const sorted = [...activeOffers].sort((a, b) => a.price - b.price);
      const bestOffer = sorted[0];
      return {
        site: d.site,
        bestPrice: bestOffer?.price,
        bestFullPrice: bestOffer?.full_price ?? undefined,
        currency: 'USD',
        bestOfferId: bestOffer?.id,
        discountPercent: bestOffer ? getDiscountPercent(bestOffer) ?? undefined : undefined,
      };
    });

  const items = sites.map((site) => {
    const activeOffers = (site.offers ?? []).filter((o) => o.isActive);
    const sorted = [...activeOffers].sort((a, b) => a.price - b.price);
    const bestOffer = sorted[0];
    const bestPrice = bestOffer?.price;
    const bestFullPrice = bestOffer?.full_price ?? undefined;
    const bestOfferId = bestOffer?.id;
    const currency = "USD";
    const discountPercent = getMaxDiscountPercent(activeOffers) ?? undefined;
    return { site, bestPrice, bestFullPrice, currency, bestOfferId, discountPercent };
  });

  const { prevHref, nextHref } = paginatedNavLinks(basePath, page, pagination.pageCount);

  // Lifetime deals — only on page 1
  const lifetimeDeals = lifetimeSites.map((site) => {
    const lifetimeOffers = (site.offers ?? []).filter((o) => o.isActive && o.offerType === 'lifetime');
    const sorted = [...lifetimeOffers].sort((a, b) => a.price - b.price);
    const bestOffer = sorted[0];
    const bestPrice = bestOffer?.price;
    const bestFullPrice = bestOffer?.full_price ?? undefined;
    const bestOfferId = bestOffer?.id;
    const currency = "USD";
    const discountPercent = getMaxDiscountPercent(lifetimeOffers) ?? undefined;
    return { site, bestPrice, bestFullPrice, currency, bestOfferId, discountPercent, forcedType: 'lifetime' as const };
  });

  return (
    <>
      {prevHref && <link rel="prev" href={prevHref} />}
      {nextHref && <link rel="next" href={nextHref} />}

      {page === 1 && featuredItems.length > 0 && (
        <section className="w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-10 lg:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <FeaturedHeader locale={locale} />
            {/*
              Only the first card is preloaded. It is the LCP element; preloading all
              three measured ~600ms WORSE on throttled mobile (median-of-5 Lighthouse),
              because three concurrent high-priority image fetches saturate the link
              and delay the one that actually decides LCP.
            */}
            <SiteCardRow items={featuredItems.slice(0, 3)} columns={3} variant="dark" priorityCount={1} />
          </div>
        </section>
      )}

      <Container className="py-10 lg:py-14" padded={false}>
        <SectionTitle as="h1" title={tSeo("sites.pageTitle")} subtitle={tSeo("sites.pageSubtitle")} />
        <PaginationScrollAnchor page={page} />
        <SiteCardGrid items={items} />
        {pagination.pageCount > 1 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.pageCount}
            basePath={basePath}
          />
        )}
      </Container>

      {/* Conditional sections — a flex column so the gap between them stays uniform
          (single, never doubled) no matter which bands/blocks are hidden. */}
      <div className="flex flex-col gap-10 lg:gap-14">
        {page === 1 && <CategorySpotlight categorySlug="ai-porn" eyebrow={t('aiSpotlightEyebrow')} theme="purple" />}

        {camSites.length > 0 && (
          <Container padded={false}>
            <SectionTitle as="h2" title={t("camTitle")} subtitle={t("camSubtitle")} />
            <SiteCardGrid items={camSites.map((site) => {
              const activeOffers = (site.offers ?? []).filter((o) => o.isActive);
              const sorted = [...activeOffers].sort((a, b) => a.price - b.price);
              const bestOffer = sorted[0];
              return {
                site,
                bestPrice: bestOffer?.price,
                currency: 'USD',
                bestOfferId: bestOffer?.id,
                discountPercent: getMaxDiscountPercent(activeOffers) ?? undefined,
                isCamSite: true,
              };
            })} />
          </Container>
        )}

        {bundles.length > 0 && (
          <SiteBundlesSection bundles={bundles} siteIncluded={false} siteName="" locale={locale} />
        )}

        {lifetimeDeals.length > 0 && (
          <Container padded={false}>
            <SectionTitle as="h2" title={t("lifetimeTitle")} subtitle={t("lifetimeSubtitle")} />
            <SiteCardGrid items={lifetimeDeals} />
          </Container>
        )}

        {page === 1 && <CategorySpotlight categorySlug="vr-porn" eyebrow={t('vrSpotlightEyebrow')} theme="cyan" />}
      </div>

      {page === 1 && <CategoryGrid />}

      {page === 1 && <LatestArticles locale={locale} limit={8} />}
    </>
  );
}

