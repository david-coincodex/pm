import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSitesWithDealsPaginated, getFeaturedDeals, getLifetimeDeals, getCamSiteDeals, getPublishedBundles, strapiMediaUrl, getDiscountPercent, getMaxDiscountPercent } from "@/lib/strapi";
import { parsePage, paginatedAlternates, paginatedNavLinks, paginatedTitle } from "@/lib/pagination";
import Container from "@/components/Container";
import SiteCardGrid from "@/components/site/SiteCardGrid";
import Pagination from "@/components/Pagination";
import FeaturedCarousel from "@/components/FeaturedCarousel";
import CategorySpotlight from "@/components/CategorySpotlight";
import BundleShowcase from "@/components/BundleShowcase";
import CategoryGrid from "@/components/CategoryGrid";
import LatestArticles from "@/components/LatestArticles";
import SectionTitle from "@/components/SectionTitle";

const PAGE_SIZE = 12;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const page = parsePage(pageStr);

  return {
    title: paginatedTitle(t("sitesTitle"), page),
    alternates: paginatedAlternates('/', page, locale),
  };
}

export default async function Home({ params, searchParams }: Props) {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const t = await getTranslations({ locale, namespace: "sites" });

  const page = parsePage(pageStr);
  const basePath = locale === 'en' ? '/' : `/${locale}/`;

  const { sites, pagination } = await getSitesWithDealsPaginated(page, PAGE_SIZE).catch(() => ({
    sites: [],
    pagination: { page: 1, pageSize: PAGE_SIZE, pageCount: 1, total: 0 },
  }));

  // Featured carousel — only on page 1
  const featuredItems = page === 1
    ? await getFeaturedDeals().then((deals) =>
        deals
          .filter((d) => d.site)
          .map((d) => {
            const activeOffers = (d.site.offers ?? []).filter((o) => o.isActive);
            const sorted = [...activeOffers].sort((a, b) => a.price - b.price);
            const bestOffer = sorted[0];
            const cover = d.site.cover_image ?? d.site.logo;
            return {
              name: d.name,
              site: {
                name: d.site.name,
                slug: d.site.slug,
                short_description: d.site.short_description,
                coverUrl: cover ? strapiMediaUrl(cover) : null,
                coverAlt: cover?.alternativeText ?? null,
                coverWidth: cover?.width ?? 0,
                coverHeight: cover?.height ?? 0,
              },
              bestPrice: bestOffer?.price,
              currency: 'USD',
              bestOfferId: bestOffer?.id,
              discountPercent: bestOffer ? getDiscountPercent(bestOffer) ?? undefined : undefined,
            };
          })
      ).catch(() => [])
    : [];

  const items = sites.map((site) => {
    const activeOffers = (site.offers ?? []).filter((o) => o.isActive);
    const sorted = [...activeOffers].sort((a, b) => a.price - b.price);
    const bestOffer = sorted[0];
    const bestPrice = bestOffer?.price;
    const bestOfferId = bestOffer?.id;
    const currency = "USD";
    const discountPercent = getMaxDiscountPercent(activeOffers) ?? undefined;
    return { site, bestPrice, currency, bestOfferId, discountPercent };
  });

  const { prevHref, nextHref } = paginatedNavLinks(basePath, page, pagination.pageCount);

  // Lifetime deals — only on page 1
  const lifetimeDeals = page === 1
    ? await getLifetimeDeals(4).then((sites) =>
        sites.map((site) => {
          const lifetimeOffers = (site.offers ?? []).filter((o) => o.isActive && o.offerType === 'lifetime');
          const sorted = [...lifetimeOffers].sort((a, b) => a.price - b.price);
          const bestOffer = sorted[0];
          const bestPrice = bestOffer?.price;
          const bestOfferId = bestOffer?.id;
          const currency = "USD";
          const discountPercent = getMaxDiscountPercent(lifetimeOffers) ?? undefined;
          return { site, bestPrice, currency, bestOfferId, discountPercent };
        })
      ).catch(() => [])
    : [];

  // Cam site deals — only on page 1
  const camSites = page === 1
    ? await getCamSiteDeals(4).catch(() => [])
    : [];

  // Bundles — only on page 1
  const bundles = page === 1
    ? await getPublishedBundles(3).catch(() => [])
    : [];

  return (
    <>
      {prevHref && <link rel="prev" href={prevHref} />}
      {nextHref && <link rel="next" href={nextHref} />}

      {page === 1 && featuredItems.length > 0 && <FeaturedCarousel items={featuredItems} locale={locale} />}

      <Container className="py-10">
        <SectionTitle as="h1" title={t("pageTitle")} subtitle={t("pageSubtitle")} />
        <SiteCardGrid items={items} />
        {pagination.pageCount > 1 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.pageCount}
            basePath={basePath}
          />
        )}
      </Container>

      {page === 1 && <CategorySpotlight categorySlug="ai-porn" eyebrow={t('aiSpotlightEyebrow')} theme="purple" />}

      {(lifetimeDeals.length > 0 || camSites.length > 0) && (
        <Container className="pb-14">
          {camSites.length > 0 && (
            <>
              <SectionTitle as="h2" title={t("camTitle")} subtitle={t("camSubtitle")} className="mt-12" />
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
                };
              })} />
            </>
          )}
        </Container>
      )}

      {bundles.length > 0 && <BundleShowcase bundles={bundles} />}

      {lifetimeDeals.length > 0 && (
        <Container className="pb-14">
          <SectionTitle as="h2" title={t("lifetimeTitle")} subtitle={t("lifetimeSubtitle")} className="mt-12" />
          <SiteCardGrid items={lifetimeDeals} />
        </Container>
      )}

      {page === 1 && <CategorySpotlight categorySlug="vr-porn" eyebrow={t('vrSpotlightEyebrow')} theme="cyan" />}

      {page === 1 && <CategoryGrid />}

      {page === 1 && <LatestArticles locale={locale} limit={8} />}
    </>
  );
}

