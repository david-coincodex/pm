import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { getReviewBySiteSlug, getReviews, getPublishedBundles, PaysiteScores, CamsiteScores, strapiMediaUrl, type Review } from '@/lib/strapi';
import Container from '@/components/Container';
import SidebarLayout from '@/components/SidebarLayout';
import RichText from '@/components/RichText';
import ProsConsList from '@/components/review/ProsConsList';
import SidebarLayoutHeader from '@/components/SidebarLayoutHeader';
import ReviewScoreCard from '@/components/review/ReviewScoreCard';
import ImageGallery from '@/components/ImageGallery';
import SiteCardGrid from '@/components/site/SiteCardGrid';
import SectionTitle from '@/components/SectionTitle';
import OffersTable from '@/components/site/OffersTable';
import PaymentMethodPills from '@/components/site/PaymentMethodPills';
import SiteBundlesSection from '@/components/site/SiteBundlesSection';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const review = await getReviewBySiteSlug(slug, locale);
  if (!review) return {};

  const canonical =
    locale === routing.defaultLocale ? `/reviews/${slug}/` : `/${locale}/reviews/${slug}/`;

  return {
    title: review.metaTitle ?? review.title,
    description: review.description ?? undefined,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        routing.locales.map((loc) => [
          loc,
          loc === routing.defaultLocale ? `/reviews/${slug}/` : `/${loc}/reviews/${slug}/`,
        ])
      ),
    },
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

export default async function ReviewDetailPage({ params }: Props) {
  const { locale, slug } = await params;

  const [review, allReviews, bundles, t, tScores] = await Promise.all([
    getReviewBySiteSlug(slug, locale),
    getReviews(locale, 5),
    getPublishedBundles(3),
    getTranslations({ locale, namespace: 'reviews' }),
    getTranslations({ locale, namespace: 'scores' }),
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

  const pros = review.pros?.split('\n').map((s) => s.trim()).filter(Boolean) ?? [];
  const cons = review.cons?.split('\n').map((s) => s.trim()).filter(Boolean) ?? [];

  const publishDate = review.publishDate
    ? new Date(review.publishDate).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

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
      <Container className="py-10 lg:py-14">
      <SidebarLayout
        sidebar={sidebar}
        header={<SidebarLayoutHeader title={review.title} description={review.description} />}
      >
        {/* Cover image */}
        {siteImage && (
          <div className="mb-8 overflow-hidden rounded-2xl">
            <Image
              src={strapiMediaUrl(siteImage)}
              alt={siteImage.alternativeText ?? site.name}
              width={siteImage.width}
              height={siteImage.height}
              className="w-full object-cover"
            />
          </div>
        )}

        {/* Meta */}
        {(review.authors.length > 0 || review.editors.length > 0 || publishDate) && (
          <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            {review.authors.length > 0 && (
              <span>
                {t('by')}{' '}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {review.authors.map((a) => a.name).join(', ')}
                </span>
              </span>
            )}
            {review.editors.length > 0 && (
              <span>
                · {t('editedBy')}{' '}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {review.editors.map((e) => e.name).join(', ')}
                </span>
              </span>
            )}
            {publishDate && (
              <span>· {t('publishedOn')} {publishDate}</span>
            )}
          </div>
        )}

        {/* Gallery */}
        {site.gallery && site.gallery.length > 0 && (
          <div className="mb-8">
            <ImageGallery images={site.gallery} />
          </div>
        )}

        {/* Pros / Cons */}
        {(pros.length > 0 || cons.length > 0) && (
          <div className="mb-8">
            <ProsConsList pros={pros} cons={cons} />
          </div>
        )}

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
    </>
  );
}
