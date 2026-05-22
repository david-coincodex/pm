'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Offer } from '@/lib/strapi';
import { routes } from '@/lib/routes';

const OFFER_TYPE_LABEL: Record<string, string> = {
  trial: 'trial',
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
  lifetime: 'lifetime',
};

interface OffersTableProps {
  offers: Offer[];
}

export default function OffersTable({ offers }: OffersTableProps) {
  const t = useTranslations('discount');

  const subscriptionOffers = offers.filter((o) => o.offerKind === 'subscription');
  const creditsOffers = offers.filter((o) => o.offerKind === 'credits');

  if (offers.length === 0) return null;

  const discountLabel = (offer: Offer) =>
    offer.full_price && offer.full_price > offer.price
      ? `-${(((offer.full_price - offer.price) / offer.full_price) * 100).toFixed(0)}%`
      : null;

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

      <p className="text-xs text-slate-400 dark:text-slate-500">
        We may earn a commission if you sign up through our links. This does not affect the price you pay.
      </p>
    </div>
  );
}
