'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Offer } from '@/lib/strapi';
import { getDiscountPercent } from '@/lib/strapi';
import { routes } from '@/lib/routes';


interface OffersTableProps {
  offers: Offer[];
}

export default function OffersTable({ offers }: OffersTableProps) {
  const t = useTranslations('discount');
  const tOffer = useTranslations('offer');

  const subscriptionOffers = offers.filter((o) => o.offerKind === 'subscription');
  const creditsOffers = offers.filter((o) => o.offerKind === 'credits');

  if (offers.length === 0) return null;

  const discountLabel = (offer: Offer) => {
    const pct = getDiscountPercent(offer);
    return pct ? `${pct}%` : null;
  };

  return (
    <div className="space-y-6 mt-8">
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
                      {offer.offerType && offer.offerType !== 'credits' ? t(offer.offerType) : ''}
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
                    <td className="px-4 py-3">
                      {offer.allowsDownloads === true && (
                        <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                        </svg>
                      )}
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
              {creditsOffers.length === 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-700/50">
                    <td colSpan={6} className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
                      {tOffer('disclaimer')}
                    </td>
                  </tr>
                </tfoot>
              )}
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
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-700/50">
                  <td colSpan={3} className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
                    {tOffer('disclaimer')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
