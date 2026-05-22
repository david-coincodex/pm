import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { getDealBySiteSlug, getSiteBySlug, getTopDeals, getBundlesForSite, getPublishedBundles, strapiMediaUrl, getCategoryBySlug, getSitesByCategorySlug, getAllCategories, type Platform } from '@/lib/strapi';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import Container from '@/components/Container';
import { routes } from '@/lib/routes';
import SidebarLayout from '@/components/SidebarLayout';
import DealBuy from '@/components/site/DealBuy';
import SubsiteGrid from '@/components/site/SubsiteGrid';
import SectionTitle from '@/components/SectionTitle';
import SiteCardGrid from '@/components/site/SiteCardGrid';
import Pagination from '@/components/Pagination';
import TrackSiteView from '@/components/TrackSiteView';
import RichText from '@/components/RichText';
import ImageGallery from '@/components/ImageGallery';
import OffersTable from '@/components/site/OffersTable';
import SiteBundlesSection from '@/components/site/SiteBundlesSection';

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;

  const categorySlug = parseCategorySlug(slug);
  if (categorySlug) {
    const [category, t] = await Promise.all([
      getCategoryBySlug(categorySlug),
      getTranslations({ locale, namespace: 'category' }),
    ]);
    if (!category) return {};
    const path = locale === routing.defaultLocale ? `/${slug}/` : `/${locale}/${slug}/`;
    return {
      title: t('pageMetaTitle', { name: category.name }),
      description: category.description ?? undefined,
      alternates: {
        canonical: path,
        languages: Object.fromEntries(
          routing.locales.map((loc) => [loc, loc === routing.defaultLocale ? `/${slug}/` : `/${loc}/${slug}/`])
        ),
      },
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

export default async function DiscountDetailPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const { page: pageStr } = await searchParams;

  const categorySlug = parseCategorySlug(slug);
  if (categorySlug) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const PAGE_SIZE = 12;
    const basePath = locale === routing.defaultLocale ? `/${slug}/` : `/${locale}/${slug}/`;

    const [category, { sites, pagination }, t] = await Promise.all([
      getCategoryBySlug(categorySlug),
      getSitesByCategorySlug(categorySlug, page, PAGE_SIZE),
      getTranslations({ locale, namespace: 'category' }),
    ]);

    if (!category) notFound();

    const items = sites.map((site) => {
      const activeOffers = (site.offers ?? []).filter((o) => o.isActive);
      const sorted = [...activeOffers].sort((a, b) => a.price - b.price);
      const bestOffer = sorted[0];
      return {
        site,
        bestPrice: bestOffer?.price,
        currency: 'USD',
        bestOfferId: bestOffer?.id,
        discountPercent:
          bestOffer?.full_price && bestOffer.full_price > bestOffer.price
            ? Math.round(((bestOffer.full_price - bestOffer.price) / bestOffer.full_price) * 100)
            : undefined,
      };
    });

    return (
      <Container className="py-10">
        <SectionTitle
          as="h1"
          title={t('heading', { name: category.name })}
          subtitle={category.description ?? t('defaultSubtitle', { name: category.name })}
        />
        <SiteCardGrid items={items} />
        {pagination.pageCount > 1 && (
          <Pagination currentPage={pagination.page} totalPages={pagination.pageCount} basePath={basePath} />
        )}
      </Container>
    );
  }

  // Site detail page
  const [site, t, tPlatform] = await Promise.all([
    getDealBySiteSlug(slug),
    getTranslations({ locale, namespace: 'discount' }),
    getTranslations({ locale, namespace: 'platform' }),
  ]);

  if (!site) notFound();

  const [relatedDeals, siteBundles] = await Promise.all([
    getTopDeals(4, slug),
    getBundlesForSite(slug, 3),
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
          />
        }
      >
        {/* Site header */}
        <div className="mb-8 flex flex-wrap items-center gap-4">
          {image && (
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
              <Image
                src={strapiMediaUrl(image)}
                alt={image.alternativeText ?? site.name}
                width={image.width}
                height={image.height}
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t('pageTitle', { name: site.name })}
            </h1>
            {site.short_description && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {site.short_description}
              </p>
            )}
          </div>
        </div>

        {/* Gallery */}
        {(site.gallery ?? []).length > 0 && (
          <ImageGallery images={site.gallery} className="mb-8" />
        )}

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
          <h2 className="mb-6 text-xl font-bold text-slate-900 dark:text-white">
            {t('peopleAlsoBought')}
          </h2>
          <SiteCardGrid
            items={relatedDeals.map((related) => {
              const activeOffers = (related.offers ?? []).filter((o) => o.isActive);
              const sorted = [...activeOffers].sort((a, b) => a.price - b.price);
              const bestOffer = sorted[0];
              return {
                site: related,
                bestPrice: bestOffer?.price,
                currency: 'USD',
                bestOfferId: bestOffer?.id,
                discountPercent:
                  bestOffer?.full_price && bestOffer.full_price > bestOffer.price
                    ? Math.round(((bestOffer.full_price - bestOffer.price) / bestOffer.full_price) * 100)
                    : undefined,
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
