'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Offer } from '@/lib/strapi';
import { getDiscountPercent } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import PaymentMethodPills from './PaymentMethodPills';
import UpsellPopup from './UpsellPopup';
import ReviewTeaser from './ReviewTeaser';

/** Daily verification update time: 1 PM UTC */
const UPDATE_HOUR_UTC = 13;

function getVerifiedDate(): Date {
  const now = new Date();
  const today1pm = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), UPDATE_HOUR_UTC));
  if (now >= today1pm) {
    return today1pm;
  }
  // Before 1 PM UTC → yesterday's 1 PM
  return new Date(today1pm.getTime() - 24 * 60 * 60 * 1000);
}

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
  paymentMethods?: string[] | null;
  review?: { slug: string; score: number | null } | null;
  initialOfferId?: number;
  parentSite?: { id: number; name: string; slug: string } | null;
}

export default function DealBuy({ offers, dealIncludes, paymentMethods, review, initialOfferId, parentSite }: DealBuyProps) {
  const t = useTranslations('discount');
  const locale = useLocale();

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

  const [selectedId, setSelectedId] = useState<number>(
    initialOfferId && allSorted.find((s) => s.id === initialOfferId)
      ? initialOfferId
      : (allSorted[0]?.id ?? 0)
  );
  const [showUpsell, setShowUpsell] = useState(false);
  const selected = allSorted.find((s) => s.id === selectedId) ?? allSorted[0];

  if (!selected) return null;

  const verifiedDate = useMemo(() => {
    const d = getVerifiedDate();
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  }, [locale]);

  const fullPrice = selected.full_price ?? 0;
  const discount = getDiscountPercent(selected);

  const isCredits = selected.offerKind === 'credits';

  return (
    <div className="rounded-none border-y border-slate-200 bg-white px-0 py-6 md:rounded-2xl md:border md:border-slate-200 md:p-6 dark:border-slate-700 dark:bg-slate-800">
      {/* Parent site tag */}
      {parentSite && (
        <div className="mb-4 flex justify-center">
          <Link
            href={routes.site(parentSite.slug)}
            className="inline-block rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 transition hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
          >
            {t('partOf', { name: parentSite.name })}
          </Link>
        </div>
      )}

      {/* Offer selector */}
      {allSorted.length > 1 && (
        <div className="mb-5 flex flex-wrap justify-center gap-2">
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
                : t(OFFER_TYPE_LABEL[offer.offerType!] as keyof typeof OFFER_TYPE_LABEL)}
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
            {t('percentOff', { percentage: discount })}
          </div>
        )}
      </div>

      {/* Buy Now button */}
      <Link
        href={routes.offer(selected.id)}
        target="_blank"
        rel="nofollow noopener noreferrer"
        onClick={() => setShowUpsell(true)}
        className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-4 text-lg font-bold text-white transition hover:bg-emerald-700 active:scale-95 dark:bg-emerald-500 dark:hover:bg-emerald-600"
      >
        {t('buyNow')}
      </Link>

      {/* Verified badge */}
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
        </svg>
        <span className="font-medium">{t('verifiedOn', { date: verifiedDate })}</span>
      </p>

      {paymentMethods && paymentMethods.length > 0 && (
        <PaymentMethodPills methods={paymentMethods} />
      )}

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

      <UpsellPopup open={showUpsell} onClose={() => setShowUpsell(false)} />

      {review && <ReviewTeaser slug={review.slug} score={review.score} />}
    </div>
  );
}
