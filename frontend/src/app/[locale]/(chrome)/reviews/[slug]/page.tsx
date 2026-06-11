import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getReviewBySiteSlug, getReviews, getPublishedBundles, PaysiteScores, CamsiteScores, strapiMediaUrl, type Review } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import { localizedAlternates } from '@/lib/pagination';
import Container from '@/components/Container';
import SidebarLayout from '@/components/SidebarLayout';
import RichText from '@/components/RichText';
import SidebarLayoutHeader from '@/components/SidebarLayoutHeader';
import ReviewScoreCard from '@/components/review/ReviewScoreCard';
import ImageGallery from '@/components/ImageGallery';
import SiteCardGrid from '@/components/site/SiteCardGrid';
import SectionTitle from '@/components/SectionTitle';
import OffersTable from '@/components/site/OffersTable';
import PaymentMethodPills from '@/components/site/PaymentMethodPills';
import SiteBundlesSection from '@/components/site/SiteBundlesSection';
import FaqSection from '@/components/FaqSection';
import BreadcrumbsSetter from '@/components/BreadcrumbsSetter';
import ContentMeta from '@/components/ContentMeta';
import { siteSettings } from '@/lib/siteSettings';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const [review, t] = await Promise.all([
    getReviewBySiteSlug(slug, locale),
    getTranslations({ locale, namespace: 'reviews' }),
  ]);
  if (!review) return {};

  const metaTitle = review.titleExtra
    ? t('reviewMetaTitle', { name: review.site.name, titleExtra: review.titleExtra })
    : t('reviewTitle', { name: review.site.name });
  const reviewPath = routes.review(slug);

  return {
    title: metaTitle,
    description: review.description ?? undefined,
    alternates: localizedAlternates(reviewPath, locale),
  };
}

function calcOverall(scores: PaysiteScores | CamsiteScores): number {
  const vals = Object.entries(scores)
    .filter(([key]) => key !== 'id')
    .map(([, v]) => v)
    .filter((v): v is number => typeof v === 'number' && v !== null);
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

const OFFER_TYPE_LABEL: Record<string, string> = {
  trial: 'Trial',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  lifetime: 'Lifetime',
  credits: 'Credits',
};

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

export default async function ReviewDetailPage({ params }: Props) {
  const { locale, slug } = await params;

  const [review, allReviews, bundles, t, tScores, tBc] = await Promise.all([
    getReviewBySiteSlug(slug, locale),
    getReviews(locale, 5),
    getPublishedBundles(3),
    getTranslations({ locale, namespace: 'reviews' }),
    getTranslations({ locale, namespace: 'scores' }),
    getTranslations({ locale, namespace: 'breadcrumbs' }),
  ]);

  if (!review) notFound();

  const site = review.site;
  const siteImage = site.cover_image ?? site.logo;
  const scores = review.paysiteScores ?? review.camsiteScores;
  const overall = scores ? calcOverall(scores) : null;

  const paysiteEntries: [keyof PaysiteScores, string][] = [
    ['contentQuality', tScores('contentQuality')],
    ['contentAmount', tScores('contentAmount')],
    ['value', tScores('value')],
    ['updates', tScores('updates')],
    ['exclusivity', tScores('exclusivity')],
    ['features', tScores('features')],
    ['downloads', tScores('downloads')],
    ['streaming', tScores('streaming')],
    ['mobileExperience', tScores('mobileExperience')],
  ];

  const camsiteEntries: [keyof CamsiteScores, string][] = [
    ['modelVariety', tScores('modelVariety')],
    ['streamQuality', tScores('streamQuality')],
    ['features', tScores('features')],
    ['value', tScores('value')],
    ['interactivity', tScores('interactivity')],
    ['mobileExperience', tScores('mobileExperience')],
    ['privacy', tScores('privacy')],
    ['privateShows', tScores('privateShows')],
  ];

  const scoreEntries: { key: string; label: string; value: number }[] = [];
  if (review.paysiteScores) {
    for (const [key, label] of paysiteEntries) {
      const val = review.paysiteScores[key];
      if (val !== null && val !== undefined) scoreEntries.push({ key, label, value: val });
    }
  }
  if (review.camsiteScores) {
    for (const [key, label] of camsiteEntries) {
      const val = review.camsiteScores[key];
      if (val !== null && val !== undefined) scoreEntries.push({ key, label, value: val });
    }
  }

  const relatedReviews = allReviews
    .filter((r) => r.site.slug !== site.slug)
    .slice(0, 4);

  const activeOffers = (site.offers ?? []).filter((o) => o.isActive);
  const bestOffer = activeOffers.sort((a, b) => a.price - b.price)[0] ?? null;

  const sidebar = overall !== null ? (
    <ReviewScoreCard overall={overall} entries={scoreEntries} bestOffer={bestOffer} siteSlug={site.slug} />
  ) : null;

  return (
    <>
      <BreadcrumbsSetter crumbs={[
        { label: tBc('reviews'), href: routes.reviews() },
        { label: site.name, href: routes.review(slug) },
      ]} />
      <Container className="py-10 lg:py-14">
      <SidebarLayout
        sidebar={sidebar}
        header={<SidebarLayoutHeader title={t('reviewTitle', { name: site.name })} description={review.description} />}
      >
        {/* Gallery */}
        <div className="mb-8">
          <ImageGallery images={site.gallery ?? []} coverImage={siteImage} />
        </div>

        {/* Meta */}
        <ContentMeta
          author={review.author}
          publishDate={review.publishDate}
          publishedAt={review.publishedAt}
          modifiedDate={review.modifiedDate}
          locale={locale}
          showUpdated={!!review.modifiedDate}
        />

        {/* Main content */}
        {review.content && (
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <RichText content={review.content} />
          </div>
        )}

        {/* Pricing & Payment Methods */}
        {((site.offers ?? []).filter((o) => o.isActive).length > 0 ||
          (site.platform?.paymentMethods ?? []).length > 0) && (
          <div className="mt-12">
            <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">
              {t('pricingTitle')}
            </h2>
            <p className="mb-6 text-base text-slate-600 dark:text-slate-400">
              {t('pricingDescription', { siteName: site.name })}
            </p>
            {(site.offers ?? []).filter((o) => o.isActive).length > 0 && (
              <OffersTable offers={(site.offers ?? []).filter((o) => o.isActive)} />
            )}
            {site.platform?.paymentMethods && site.platform.paymentMethods.length > 0 && (
              <div className="mt-6">
                <PaymentMethodPills methods={site.platform.paymentMethods.map((pm) => pm.method)} />
              </div>
            )}
          </div>
        )}

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
                <p className="min-w-0 flex-1 text-base text-slate-600 dark:text-slate-300">
                  {site.platform.description}
                </p>
              )}
            </div>
          </div>
        )}

        {/* FAQs — review content focused */}
        <FaqSection faqs={review.faqs} bare />
      </SidebarLayout>
    </Container>

      {relatedReviews.length > 0 && (
        <Container>
          <div className="mt-16">
            <SectionTitle title={t('alsoRead')} />
            <SiteCardGrid
              items={relatedReviews.map((r) => {
                const s = r.paysiteScores ?? r.camsiteScores;
                return {
                  site: r.site,
                  review: { score: s ? calcOverall(s) : null },
                };
              })}
            />
          </div>
        </Container>
      )}

    <SiteBundlesSection
      bundles={bundles}
      siteIncluded={false}
      siteName={site.name}
      locale={locale}
    />

    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Review',
          name: review.titleExtra
            ? `${site.name} Review: ${review.titleExtra}`
            : `${site.name} Review`,
          description: review.description ?? undefined,
          datePublished: review.publishDate ?? review.publishedAt,
          ...(review.modifiedDate && { dateModified: review.modifiedDate }),
          author: review.author ? [{
            '@type': 'Person',
            name: review.author.name,
            url: `${siteSettings.baseUrl}${routes.blogAuthor(review.author.slug)}`,
            ...(review.author.bio && { description: review.author.bio }),
          }] : [],
          ...(overall !== null && {
            reviewRating: {
              '@type': 'Rating',
              ratingValue: overall,
              bestRating: 10,
              worstRating: 0,
            },
          }),
          itemReviewed: {
            '@type': 'Service',
            name: site.name,
            url: `${siteSettings.baseUrl}/${site.slug}/`,
            ...(site.short_description && { description: site.short_description }),
            ...(siteImage && { image: strapiMediaUrl(siteImage) }),
            ...(activeOffers.length > 0 && { offers: buildOffersSchema(activeOffers) }),
          },
        }),
      }}
    />
    </>
  );
}
