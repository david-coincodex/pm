'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Offer } from '@/lib/strapi';
import { getDiscountPercent } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import PaymentMethodPills from './PaymentMethodPills';
import OfferLink from '@/components/offer/OfferLink';
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


interface DealBuyProps {
  offers: Offer[];
  dealIncludes?: string | null;
  paymentMethods?: string[] | null;
  review?: { slug: string; score: number | null } | null;
  initialOfferId?: number;
  parentSite?: { id: number; name: string; slug: string } | null;
  siteName?: string | null;
  siteSlug?: string | null;
}

export default function DealBuy({ offers, dealIncludes, paymentMethods, review, initialOfferId, parentSite, siteName, siteSlug }: DealBuyProps) {
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
  const selected = allSorted.find((s) => s.id === selectedId) ?? allSorted[0];

  // Sticky mobile buy-bar: show it once the main card scrolls out of view.
  const cardRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        // Show once the card has scrolled up out of view (behind the sticky header).
        setShowBar(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { rootMargin: '-80px 0px 0px 0px', threshold: 0 }, // -80px ≈ sticky header height
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Above the early return — hooks must run in the same order every render.
  const verifiedDate = useMemo(() => {
    const d = getVerifiedDate();
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  }, [locale]);

  if (!selected) return null;

  const fullPrice = selected.full_price ?? 0;
  const discount = getDiscountPercent(selected);

  const isCredits = selected.offerKind === 'credits';

  const offerInfo = {
    id: selected.id,
    siteName,
    siteSlug,
    price: selected.price,
    fullPrice: selected.full_price,
    offerType: selected.offerType,
    offerKind: selected.offerKind,
    credits: selected.credits,
  };

  return (
    <>
    {/* Background and border are desktop-only: on mobile the card is full-bleed and must
        blend completely into the page in BOTH themes. */}
    <div ref={cardRef} className="relative rounded-none px-0 pb-6 md:rounded-2xl md:border md:border-slate-200 md:bg-white md:p-6 dark:md:border-slate-700 dark:md:bg-slate-800">
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

      {/* Discount badge — floated in the top-right corner so it doesn't add height to the options row */}
      {discount !== null && discount > 0 && (
        <span
          className="absolute right-0 top-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-emerald-100 px-4 py-2 leading-none text-emerald-700 md:right-6 md:top-6 dark:bg-emerald-900/30 dark:text-emerald-400"
          aria-label={t('percentOff', { percentage: discount })}
        >
          <span className="text-2xl font-extrabold">{discount}%</span>
          <span className="mt-0.5 text-xs font-semibold uppercase tracking-wide">{t('off')}</span>
        </span>
      )}

      {/* Offer options — reserve right space for the floated discount badge */}
      {allSorted.length > 1 && (
        <div className={`mb-4 flex flex-wrap gap-2${discount !== null && discount > 0 ? ' pr-28' : ''}`}>
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
                : offer.offerType && offer.offerType !== 'credits'
                  ? t(offer.offerType)
                  : ''}
            </button>
          ))}
        </div>
      )}

      {/* Price: "From <full price>" then the discounted price */}
      <div className="mb-6">
        {!isCredits && fullPrice > selected.price && (
          <div className="mb-1 text-sm text-slate-400">
            {t('from')} <span className="line-through">${fullPrice.toFixed(2)}</span>
          </div>
        )}
        <div className="text-5xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
          {selected.price === 0 ? t('free') : `$${selected.price.toFixed(2)}`}
        </div>
        {isCredits && selected.credits && (
          <div className="mt-1 text-base font-semibold text-slate-700 dark:text-slate-200">
            {selected.credits} {t('credits')}
          </div>
        )}
      </div>

      {/* Buy Now button */}
      <OfferLink
        offer={offerInfo}
        className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-4 text-lg font-bold text-white transition hover:bg-emerald-700 active:scale-95 dark:bg-emerald-500 dark:hover:bg-emerald-600"
      >
        {t('buyNow')}
      </OfferLink>

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
        <ul className="mt-5 columns-2 gap-x-4 md:columns-1">
          {dealIncludes.split('\n').map((item) => item.trim()).filter(Boolean).map((item, i) => (
            <li key={i} className="mb-2 flex break-inside-avoid items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      )}

      {review && <ReviewTeaser slug={review.slug} score={review.score} />}
    </div>

    {/* Sticky mobile/tablet buy-bar — appears once the card scrolls out of view */}
    <div
      className={`fixed inset-x-0 bottom-0 z-40 lg:hidden transition-transform duration-200 ${
        showBar ? 'translate-y-0' : 'translate-y-full'
      }`}
      inert={!showBar}
    >
      <div
        className="flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.08)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
            {isCredits
              ? `${selected.credits} ${t('credits')}`
              : selected.offerType && selected.offerType !== 'credits'
                ? t(selected.offerType)
                : ''}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {selected.price === 0 ? t('free') : `$${selected.price.toFixed(2)}`}
            </span>
            {!isCredits && fullPrice > selected.price && (
              <span className="text-sm text-slate-400 line-through">${fullPrice.toFixed(2)}</span>
            )}
            {discount !== null && discount > 0 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                {discount}%
              </span>
            )}
          </div>
        </div>
        <OfferLink
          offer={offerInfo}
          className="shrink-0 rounded-xl bg-emerald-600 px-6 py-3 text-base font-bold text-white transition hover:bg-emerald-700 active:scale-95 dark:bg-emerald-500 dark:hover:bg-emerald-600"
        >
          {t('buyNow')}
        </OfferLink>
      </div>
    </div>
    </>
  );
}
