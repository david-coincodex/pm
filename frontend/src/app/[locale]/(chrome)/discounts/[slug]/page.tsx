import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  getDealBySiteSlug,
  getTopDeals,
  getBundlesForSite,
  getPublishedBundles,
  strapiMediaUrl,
  getReviewBySiteSlug,
  getMaxDiscountPercent,
  type PaysiteScores,
  type CamsiteScores,
} from '@/lib/strapi';
import { buildDynamicFaqs } from '@/lib/dynamicFaqs';
import { routing } from '@/i18n/routing';
import { localizedAlternates } from '@/lib/pagination';
import Container from '@/components/Container';
import { routes } from '@/lib/routes';
import SidebarLayout from '@/components/SidebarLayout';
import DealBuy from '@/components/site/DealBuy';
import SubsiteGrid from '@/components/site/SubsiteGrid';
import SectionTitle from '@/components/SectionTitle';
import SiteCardGrid from '@/components/site/SiteCardGrid';
import TrackSiteView from '@/components/TrackSiteView';
import RichText from '@/components/RichText';
import OffersTable from '@/components/site/OffersTable';
import SiteBundlesSection from '@/components/site/SiteBundlesSection';
import FaqSection from '@/components/FaqSection';
import SidebarLayoutHeader from '@/components/SidebarLayoutHeader';
import BreadcrumbsSetter from '@/components/BreadcrumbsSetter';
import ImageGallery from '@/components/ImageGallery';
import { siteSettings } from '@/lib/siteSettings';

function buildOffersSchema(offers: { id: number; offerType: string | null; price: number; full_price: number | null }[]) {
  return offers.map((o) => ({
    '@type': 'Offer',
    name: o.offerType ? (OFFER_TYPE_LABEL[o.offerType] ?? o.offerType) : undefined,
    price: o.price.toFixed(2),
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    url: `${siteSettings.baseUrl}${routes.offer(o.id)}`,
    ...(o.full_price && o.full_price > o.price && {
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: o.price.toFixed(2),
        priceCurrency: 'USD',
        referencePrice: o.full_price.toFixed(2),
      },
    }),
  }));
}

const OFFER_TYPE_LABEL: Record<string, string> = {
  trial: 'Trial',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  lifetime: 'Lifetime',
  credits: 'Credits',
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

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ offer?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, slug } = await params;

  const site = await getDealBySiteSlug(slug, locale);
  if (!site) return {};
  const t = await getTranslations({ locale, namespace: 'pageSEO' });
  const sitePath = routes.site(site.slug);

  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'short' });
  const year = now.getFullYear();

  const today1pm = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13));
  const verifiedDate = now >= today1pm ? today1pm : new Date(today1pm.getTime() - 86400000);
  const verifiedIso = verifiedDate.toISOString();

  const discountedOffers = (site.offers ?? []).filter(
    (o) => o.isActive && o.full_price != null && o.full_price > o.price
  );
  let metaTitle: string;
  if (discountedOffers.length > 0) {
    const cheapest = discountedOffers.reduce((a, b) => (a.price < b.price ? a : b));
    const percentage = Math.round((1 - cheapest.price / cheapest.full_price!) * 100);
    metaTitle = String(t('discount.metaTitle' as never, { percentage, name: site.name, price: cheapest.price, month, year } as never));
  } else {
    metaTitle = t('discount.metaTitleFallback', { name: site.name });
  }

  return {
    title: metaTitle,
    description: site.short_description ?? undefined,
    other: { 'article:modified_time': verifiedIso, 'last-modified': verifiedIso },
    alternates: localizedAlternates(sitePath, locale),
  };
}

export default async function DiscountDetailPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const { offer: offerParam } = await searchParams;

  const [site, t, tPlatform, tSeo] = await Promise.all([
    getDealBySiteSlug(slug, locale),
    getTranslations({ locale, namespace: 'discount' }),
    getTranslations({ locale, namespace: 'platform' }),
    getTranslations({ locale, namespace: 'pageSEO' }),
  ]);

  if (!site) notFound();

  const [relatedDeals, siteBundles, review] = await Promise.all([
    getTopDeals(4, slug),
    getBundlesForSite(slug, 3),
    getReviewBySiteSlug(slug, locale),
  ]);
  const bundlesToShow = siteBundles.length > 0 ? siteBundles : await getPublishedBundles(3);

  const image = site.cover_image ?? site.logo;
  
  // Determine which data source to use: parent_site or current site
  const dataSource = site.parent_site ?? site;
  const parentSiteInfo = site.parent_site ? { id: site.parent_site.id, name: site.parent_site.name, slug: site.parent_site.slug } : null;
  
  const activeOffers = (dataSource.offers ?? [])
    .filter((s) => s.isActive)
    .sort((a, b) => a.priority - b.priority);

  const forcedOfferId = offerParam ? Number(offerParam) : null;
  const initialOfferId = forcedOfferId && activeOffers.find((o) => o.id === forcedOfferId)
    ? forcedOfferId
    : undefined;

  return (
    <>
    <BreadcrumbsSetter crumbs={[
      { label: site.name, href: routes.site(slug) },
    ]} />
    <Container className="py-10 lg:py-14">
      <TrackSiteView site={{
        slug: site.slug,
        name: site.name,
        shortDescription: site.short_description ?? undefined,
        bestPrice: activeOffers[0]?.price,
        bestFullPrice: activeOffers[0]?.full_price ?? null,
      }} />

      <SidebarLayout
        sidebar={
          <DealBuy
            offers={activeOffers}
            dealIncludes={dataSource.included}
            paymentMethods={dataSource.platform?.paymentMethods?.map((pm) => pm.method) ?? null}
            review={review ? { slug: site.slug, score: computeOverallScore(review.paysiteScores, review.camsiteScores) } : null}
            initialOfferId={initialOfferId}
            parentSite={parentSiteInfo}
          />
        }
        header={
          <SidebarLayoutHeader
            title={tSeo('discount.pageTitle', { name: site.name })}
            description={site.short_description}
          />
        }
      >
        {/* Gallery */}
        <div className="mb-8">
          <ImageGallery images={site.gallery ?? []} coverImage={image} />
        </div>

        {/* Rich-text content */}
        {site.description && (
          <RichText content={site.description} className="mt-8" />
        )}

        {/* Deal offers */}
        <OffersTable offers={activeOffers} />

        {/* Bonus child sites */}
        <SubsiteGrid subsites={site.child_sites ?? []} siteName={site.name} siteSlug={site.slug} />


        {/* FAQs — editorial Strapi FAQs first, then auto-generated dynamic offer FAQs */}
        <FaqSection faqs={[...(site.faqs ?? []), ...buildDynamicFaqs(site)]} bare />
      </SidebarLayout>

      {/* People also bought */}
      {relatedDeals.length > 0 && (
        <div className="mt-10 lg:mt-14">
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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: site.name,
            url: `${siteSettings.baseUrl}${routes.site(site.slug)}`,
            ...(site.short_description && { description: site.short_description }),
            ...(image && { image: strapiMediaUrl(image) }),
            ...(activeOffers.length > 0 && { offers: buildOffersSchema(activeOffers) }),
            ...(review && computeOverallScore(review.paysiteScores, review.camsiteScores) !== null && {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: computeOverallScore(review.paysiteScores, review.camsiteScores),
                bestRating: 10,
                worstRating: 0,
                reviewCount: 1,
              },
              review: {
                '@type': 'Review',
                url: `${siteSettings.baseUrl}${routes.review(site.slug)}`,
                author: review.author ? {
                  '@type': 'Person',
                  name: review.author.name,
                  url: `${siteSettings.baseUrl}${routes.blogAuthor(review.author.slug)}`,
                } : undefined,
                reviewRating: {
                  '@type': 'Rating',
                  ratingValue: computeOverallScore(review.paysiteScores, review.camsiteScores),
                  bestRating: 10,
                  worstRating: 0,
                },
              },
            }),
          }),
        }}
      />
    </>
  );
}
