import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { getDealBySiteSlug, getSiteBySlug, getTopDeals, getBundlesForSite, getPublishedBundles, strapiMediaUrl, getCategoryBySlug, getSitesByCategorySlug, getAllCategories, getReviewBySiteSlug, getDiscountPercent, getMaxDiscountPercent, type Platform, type PaysiteScores, type CamsiteScores } from '@/lib/strapi';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { parsePage, paginatedAlternates, paginatedNavLinks, paginatedTitle } from '@/lib/pagination';
import Container from '@/components/Container';
import { routes } from '@/lib/routes';
import SidebarLayout from '@/components/SidebarLayout';
import DealBuy from '@/components/site/DealBuy';
import SubsiteGrid from '@/components/site/SubsiteGrid';
import SectionTitle from '@/components/SectionTitle';
import SiteCardGrid from '@/components/site/SiteCardGrid';
import SiteCardInlineList from '@/components/rich-text/SiteCardInlineList';
import Pagination from '@/components/Pagination';
import TrackSiteView from '@/components/TrackSiteView';
import RichText from '@/components/RichText';
import OffersTable from '@/components/site/OffersTable';
import SiteBundlesSection from '@/components/site/SiteBundlesSection';
import SidebarLayoutHeader from '@/components/SidebarLayoutHeader';
import BreadcrumbsSetter from '@/components/BreadcrumbsSetter';

/** Extract category slug from a URL slug like "best-ai-porn-sites" → "ai-porn" */
function parseCategorySlug(slug: string): string | null {
  const m = slug.match(/^best-(.+)-sites$/);
  return m ? m[1] : null;
}

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateStaticParams() {
  const categories = await getAllCategories().catch(() => []);
  return routing.locales.flatMap((locale) =>
    categories.map((cat) => ({ locale, slug: `best-${cat.slug}-sites` }))
  );
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const { page: pageStr } = await searchParams;

  const categorySlug = parseCategorySlug(slug);
  if (categorySlug) {
    const [category, t] = await Promise.all([
      getCategoryBySlug(categorySlug),
      getTranslations({ locale, namespace: 'category' }),
    ]);
    if (!category) return {};
    const page = parsePage(pageStr);
    return {
      title: paginatedTitle(t('pageMetaTitle', { name: category.name }), page),
      description: category.description ?? undefined,
      alternates: paginatedAlternates(`/${slug}/`, page, locale),
    };
  }

  const site = await getDealBySiteSlug(slug);
  if (!site) return {};
  const t = await getTranslations({ locale, namespace: 'discount' });
  const canonical =
    locale === routing.defaultLocale
      ? `/${site.slug}/`
      : `/${locale}/${site.slug}/`;

  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'short' });
  const year = now.getFullYear();

  // Verified date: today at 1 PM UTC if past, otherwise yesterday 1 PM UTC
  const today1pm = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13));
  // Verified date object for lastModified
  const verifiedDate = now >= today1pm ? today1pm : new Date(today1pm.getTime() - 86400000);
  const verifiedIso = verifiedDate.toISOString();

  const discountedOffers = (site.offers ?? []).filter(
    (o) => o.isActive && o.full_price != null && o.full_price > o.price
  );
  let metaTitle: string;
  if (discountedOffers.length > 0) {
    const cheapest = discountedOffers.reduce((a, b) => (a.price < b.price ? a : b));
    const percentage = Math.round((1 - cheapest.price / cheapest.full_price!) * 100);
    metaTitle = String(t('pageMetaTitle' as never, { percentage, name: site.name, price: cheapest.price, month, year } as never));
  } else {
    metaTitle = t('pageTitle', { name: site.name });
  }

  return {
    title: metaTitle,
    description: site.short_description ?? undefined,
    other: { 'article:modified_time': verifiedIso, 'last-modified': verifiedIso },
    alternates: {
      canonical,
      languages: Object.fromEntries(
        routing.locales.map((loc) => [
          loc,
          loc === routing.defaultLocale
            ? `/${site.slug}/`
            : `/${loc}/${site.slug}/`,
        ])
      ),
    },
  };
}

const OFFER_TYPE_LABEL: Record<string, string> = {
  trial: 'trial',
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
  lifetime: 'lifetime',
};

/** Average all non-null numeric scores → 0–10 rounded to 1 decimal, or null if no scores. */
function computeOverallScore(
  paysite: PaysiteScores | null,
  camsite: CamsiteScores | null,
): number | null {
  const scores = [...Object.entries(paysite ?? {}), ...Object.entries(camsite ?? {})]
    .filter(([key]) => key !== 'id')
    .map(([, v]) => v)
    .filter((v): v is number => typeof v === 'number');
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

export default async function DiscountDetailPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const { page: pageStr } = await searchParams;

  const categorySlug = parseCategorySlug(slug);
  if (categorySlug) {
    const page = parsePage(pageStr);
    const PAGE_SIZE = 12;
    const basePath = locale === 'en' ? `/${slug}/` : `/${locale}/${slug}/`;

    const [category, { sites, pagination }, t] = await Promise.all([
      getCategoryBySlug(categorySlug),
      getSitesByCategorySlug(categorySlug, page, PAGE_SIZE),
      getTranslations({ locale, namespace: 'category' }),
    ]);

    if (!category) notFound();

    const { prevHref, nextHref } = paginatedNavLinks(basePath, page, pagination.pageCount);

    return (
      <>
        <BreadcrumbsSetter crumbs={[
          { label: category.name, href: `/${slug}/` },
        ]} />
        {prevHref && <link rel="prev" href={prevHref} />}
        {nextHref && <link rel="next" href={nextHref} />}
        <Container className="py-10">
          <SidebarLayout
            reversed
            sidebar={<div />}
            header={
              <SectionTitle
                as="h1"
                title={t('heading', { name: category.name })}
                subtitle={category.description ?? t('defaultSubtitle', { name: category.name })}
              />
            }
          >
            {category.intro && <RichText content={category.intro} />}
            <SiteCardInlineList sites={sites} initialShow={5} />
            {category.content && <RichText content={category.content} />}
            {pagination.pageCount > 1 && (
              <Pagination currentPage={pagination.page} totalPages={pagination.pageCount} basePath={basePath} />
            )}
          </SidebarLayout>
        </Container>
      </>
    );
  }

  // Site detail page
  const [site, t, tPlatform] = await Promise.all([
    getDealBySiteSlug(slug),
    getTranslations({ locale, namespace: 'discount' }),
    getTranslations({ locale, namespace: 'platform' }),
  ]);

  if (!site) notFound();

  const [relatedDeals, siteBundles, review] = await Promise.all([
    getTopDeals(4, slug),
    getBundlesForSite(slug, 3),
    getReviewBySiteSlug(slug, locale),
  ]);
  const bundlesToShow = siteBundles.length > 0 ? siteBundles : await getPublishedBundles(3);

  const image = site.cover_image ?? site.logo;
  const activeOffers = (site.offers ?? [])
    .filter((s) => s.isActive)
    .sort((a, b) => a.priority - b.priority);

  const subscriptionOffers = activeOffers.filter((o) => o.offerKind === 'subscription');
  const creditsOffers = activeOffers.filter((o) => o.offerKind === 'credits');
  const discountLabel = (offer: typeof activeOffers[0]) =>
    offer.full_price && offer.full_price > offer.price
      ? `-${(((offer.full_price - offer.price) / offer.full_price) * 100).toFixed(0)}%`
      : null;

  return (
    <>
    <BreadcrumbsSetter crumbs={[
      { label: site.name, href: `/${slug}/` },
    ]} />
    <Container className="py-10">
      <TrackSiteView site={{
        slug: site.slug,
        name: site.name,
        shortDescription: site.short_description ?? undefined,
        bestPrice: activeOffers[0]?.price,
        bestFullPrice: activeOffers[0]?.full_price ?? null,
      }} />

      {/* Hero cover image */}
      {site.cover_image && (
        <div className="mb-8 overflow-hidden rounded-2xl">
          <Image
            src={strapiMediaUrl(site.cover_image)}
            alt={site.cover_image.alternativeText ?? site.name}
            width={site.cover_image.width}
            height={site.cover_image.height}
            className="w-full object-cover"
            priority
          />
        </div>
      )}

      <SidebarLayout
        sidebar={
          <DealBuy
            offers={activeOffers}
            dealIncludes={site.included}
            paymentMethods={site.platform?.paymentMethods?.map((pm) => pm.method) ?? null}
            review={review ? { slug: site.slug, score: computeOverallScore(review.paysiteScores, review.camsiteScores) } : null}
          />
        }
        header={
          <SidebarLayoutHeader
            title={t('pageTitle', { name: site.name })}
            description={site.short_description}
            gallery={site.gallery ?? []}
          />
        }
      >
        {/* Rich-text content */}
        {site.description && (
          <RichText content={site.description} className="mt-8" />
        )}

        {/* Deal offers */}
        <OffersTable offers={activeOffers} />

        {/* Bonus subsites */}
        <SubsiteGrid subsites={site.subsites ?? []} siteName={site.name} siteSlug={site.slug} />

        {/* Platform info */}
        {site.platform && (
          <div className="mt-10">
            <h2 className="mb-5 text-xl font-bold text-slate-900 dark:text-white">
              Operated by{' '}
              {site.platform.website ? (
                <a
                  href={site.platform.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  {site.platform.name}
                </a>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">{site.platform.name}</span>
              )}
            </h2>
            <div className="flex flex-wrap items-start gap-4">
              {site.platform.logo && (
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-700">
                  <img
                    src={strapiMediaUrl(site.platform.logo)}
                    alt={site.platform.logo.alternativeText ?? site.platform.name}
                    className="h-full w-full object-contain"
                  />
                </div>
              )}
              {site.platform.description && (
                <p className="flex-1 min-w-0 text-base text-slate-600 dark:text-slate-300">
                  {site.platform.description}
                </p>
              )}
            </div>
          </div>
        )}
      </SidebarLayout>

      {/* People also bought */}
      {relatedDeals.length > 0 && (
        <div className="mt-16">
          <SectionTitle title={t('peopleAlsoBought')} />
          <SiteCardGrid
            items={relatedDeals.map((related) => {
              const activeOffers = (related.offers ?? []).filter((o) => o.isActive);
              const sorted = [...activeOffers].sort((a, b) => a.price - b.price);
              const bestOffer = sorted[0];
              return {
                site: related,
                bestPrice: bestOffer?.price,
                bestFullPrice: bestOffer?.full_price ?? undefined,
                currency: 'USD',
                bestOfferId: bestOffer?.id,
                discountPercent: getMaxDiscountPercent(activeOffers) ?? undefined,
              };
            })}
          />
        </div>
      )}
    </Container>

      <SiteBundlesSection
        bundles={bundlesToShow}
        siteIncluded={siteBundles.length > 0}
        siteName={site.name}
        locale={locale}
      />
    </>
  );
}
