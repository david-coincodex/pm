import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { getDealBySiteSlug, getSiteBySlug, getTopDeals, strapiMediaUrl } from '@/lib/strapi';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import Container from '@/components/Container';
import { routes } from '@/lib/routes';
import SidebarLayout from '@/components/SidebarLayout';
import DealBuy from '@/components/discount/DealBuy';
import SubsiteGrid from '@/components/site/SubsiteGrid';
import SidebarLayoutHeader from '@/components/SidebarLayoutHeader';
import BreadcrumbsSetter from '@/components/BreadcrumbsSetter';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) return {};
  const t = await getTranslations({ locale, namespace: 'discount' });
  const canonical =
    locale === routing.defaultLocale
      ? `/discount/${site.slug}/`
      : `/${locale}/discount/${site.slug}/`;

  return {
    title: t('pageTitle', { name: site.name }),
    description: site.short_description ?? undefined,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        routing.locales.map((loc) => [
          loc,
          loc === routing.defaultLocale
            ? `/discount/${site.slug}/`
            : `/${loc}/discount/${site.slug}/`,
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

export default async function DiscountDetailPage({ params }: Props) {
  const { locale, slug } = await params;

  const [site, t] = await Promise.all([
    getDealBySiteSlug(slug, locale),
    getTranslations({ locale, namespace: 'discount' }),
  ]);

  if (!site) notFound();

  const relatedDeals = await getTopDeals(4, slug);

  const image = site.cover_image ?? site.logo;
  const activeOffers = (site.offers ?? [])
    .filter((s) => s.isActive)
    .sort((a, b) => a.priority - b.priority);

  return (
    <>
      <BreadcrumbsSetter crumbs={[
        { label: site.name, href: `/discount/${slug}/` },
      ]} />
      <Container className="py-10">
        <SidebarLayout
        sidebar={
          <DealBuy
            offers={activeOffers}
            dealIncludes={site.included}
          />
        }
        header={
          <SidebarLayoutHeader
            title={t('pageTitle', { name: site.name })}
            description={site.short_description}
            image={image}
          />
        }
      >
        {/* Deal offers */}
        <div className="space-y-6">
          {activeOffers.length > 0 && (() => {
            const subscriptionOffers = activeOffers.filter((o) => o.offerKind === 'subscription');
            const creditsOffers = activeOffers.filter((o) => o.offerKind === 'credits');

            const discountLabel = (offer: typeof activeOffers[0]) => offer.full_price && offer.full_price > offer.price
              ? `-${(((offer.full_price - offer.price) / offer.full_price) * 100).toFixed(0)}%`
              : null;

            return (
              <>
                {/* Subscription offers table */}
                {subscriptionOffers.length > 0 && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-400">
                            <th className="px-4 py-3">{t('offerType')}</th>
                            <th className="px-4 py-3">{t('price')}</th>
                            <th className="px-4 py-3">{t('regularPrice')}</th>
                            <th className="px-4 py-3">{t('discount')}</th>
                            <th className="px-4 py-3">{t('allowsDownloads')}</th>
                            <th className="px-4 py-3"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {subscriptionOffers.map((offer) => (
                            <tr key={offer.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40">
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white capitalize">
                                {String(t(OFFER_TYPE_LABEL[offer.offerType!] as never))}
                              </td>
                              <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">
                                ${offer.price.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-slate-400 line-through">
                                {offer.full_price ? `$${offer.full_price.toFixed(2)}` : '—'}
                              </td>
                              <td className="px-4 py-3">
                                {discountLabel(offer) && (
                                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                    {discountLabel(offer)}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {offer.allowsDownloads ? t('yes') : t('no')}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Link
                                  href={routes.offer(offer.id)}
                                  target="_blank"
                                  rel="nofollow noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                                >
                                  {t('getDiscount')}
                                  <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Credits offers table */}
                {creditsOffers.length > 0 && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-400">
                            <th className="px-4 py-3">{t('price')}</th>
                            <th className="px-4 py-3">{t('credits')}</th>
                            <th className="px-4 py-3"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {creditsOffers.map((offer) => (
                            <tr key={offer.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40">
                              <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">
                                ${offer.price.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                                {offer.credits} {t('credits')}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Link
                                  href={routes.offer(offer.id)}
                                  target="_blank"
                                  rel="nofollow noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                                >
                                  {t('getDiscount')}
                                  <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Bonus child sites */}
        <SubsiteGrid subsites={site.child_sites ?? []} siteName={site.name} siteSlug={site.slug} />
      </SidebarLayout>

      {/* People also bought */}
      {relatedDeals.length > 0 && (
        <div className="mt-16">
          <h2 className="mb-6 text-xl font-bold text-slate-900 dark:text-white">
            {t('peopleAlsoBought')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {relatedDeals.map((related) => {
              const relatedImage = related.cover_image ?? related.logo;
              const bestOffer = (related.offers ?? [])
                .filter((o) => o.isActive)
                .sort((a, b) => a.price - b.price)[0];
              return (
                <Link
                  key={related.id}
                  href={routes.discount(related.slug)}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-700">
                    {relatedImage ? (
                      <Image
                        src={strapiMediaUrl(relatedImage)}
                        alt={relatedImage.alternativeText ?? related.name}
                        width={relatedImage.width}
                        height={relatedImage.height}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400 dark:text-slate-500" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 p-4">
                    <span className="font-semibold text-slate-900 group-hover:underline dark:text-white">
                      {related.name}
                    </span>
                    {bestOffer && (
                      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        {t('price')}: ${bestOffer.price.toFixed(2)}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </Container>
    </>
  );
}
