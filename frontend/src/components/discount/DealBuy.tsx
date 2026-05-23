'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Offer } from '@/lib/strapi';
import { getDiscountPercent } from '@/lib/strapi';
import { routes } from '@/lib/routes';

const TYPE_ORDER: NonNullable<Offer['offerType']>[] = [
  'trial',
  'monthly',
  'quarterly',
  'yearly',
  'lifetime',
];

const OFFER_TYPE_LABEL: Record<string, string> = {
  trial: 'trial',
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
  lifetime: 'lifetime',
};

interface DealBuyProps {
  offers: Offer[];
  dealIncludes?: string | null;
}

export default function DealBuy({ offers, dealIncludes }: DealBuyProps) {
  const t = useTranslations('discount');

  // Separate by kind
  const subscriptionOffers = offers.filter((o) => o.offerKind === 'subscription');
  const creditsOffers = offers.filter((o) => o.offerKind === 'credits');

  // Sort subscription offers by type order
  const sortedSubs = TYPE_ORDER
    .map((type) => subscriptionOffers.find((s) => s.offerType === type))
    .filter((s): s is Offer => s !== undefined);

  // Sort credits offers by price
  const sortedCredits = [...creditsOffers].sort((a, b) => a.price - b.price);

  // Combined sorted list for selection
  const allSorted = [...sortedSubs, ...sortedCredits];

  const [selectedId, setSelectedId] = useState<number>(allSorted[0]?.id ?? 0);
  const selected = allSorted.find((s) => s.id === selectedId) ?? allSorted[0];

  if (!selected) return null;

  const fullPrice = selected.full_price ?? 0;
  const discount = getDiscountPercent(selected);

  const isCredits = selected.offerKind === 'credits';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
        {t('bestPrice')}
      </h2>

      {/* Offer selector */}
      {allSorted.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {allSorted.map((offer) => (
            <button
              key={offer.id}
              type="button"
              onClick={() => setSelectedId(offer.id)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                offer.id === selected.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              {offer.offerKind === 'credits'
                ? `${offer.credits} ${t('credits')}`
                : String(t(OFFER_TYPE_LABEL[offer.offerType!] as never))}
            </button>
          ))}
        </div>
      )}

      {/* Price display */}
      <div className="mb-6 text-center">
        <div className="text-5xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
          ${selected.price.toFixed(2)}
        </div>
        {isCredits && selected.credits && (
          <div className="mt-2 text-base font-semibold text-slate-700 dark:text-slate-200">
            {selected.credits} {t('credits')}
          </div>
        )}
        {!isCredits && fullPrice > selected.price && (
          <div className="mt-2 text-sm text-slate-400 line-through">
            ${fullPrice.toFixed(2)}
          </div>
        )}
        {discount !== null && discount > 0 && (
          <div className="mt-3 inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            {discount}% off
          </div>
        )}
      </div>

      {/* Buy Now button */}
      <Link
        href={routes.offer(selected.id)}
        target="_blank"
        rel="nofollow noopener noreferrer"
        className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-4 text-lg font-bold text-white transition hover:bg-emerald-700 active:scale-95 dark:bg-emerald-500 dark:hover:bg-emerald-600"
      >
        {t('buyNow')}
      </Link>

      {/* Deal includes */}
      {dealIncludes && (
        <ul className="mt-5 space-y-2">
          {dealIncludes.split('\n').map((item) => item.trim()).filter(Boolean).map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
