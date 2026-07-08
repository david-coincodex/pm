'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { routes } from '@/lib/routes';
import { siteSettings } from '@/lib/siteSettings';
import { getDiscountPercent } from '@/lib/strapi';
import PopoverSheet from '@/components/PopoverSheet';
import type { OfferInfo, CrossSellSite } from '@/components/offer/types';

type Phase = 'feedback' | 'thanks' | 'sorry';

interface UpsellPopupProps {
  offer: OfferInfo | null;
  featured: CrossSellSite[];
  open: boolean;
  onClose: () => void;
}

/** Pick a random featured site, excluding the one the user just clicked. */
function pickCrossSell(featured: CrossSellSite[], excludeSlug?: string | null): CrossSellSite | null {
  const pool = featured.filter((s) => s.slug !== excludeSlug);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function UpsellPopup({ offer, featured, open, onClose }: UpsellPopupProps) {
  const t = useTranslations('upsell');
  const td = useTranslations('discount');
  const [phase, setPhase] = useState<Phase>('feedback');
  const [crossSell, setCrossSell] = useState<CrossSellSite | null>(null);

  // Reset to the feedback phase whenever a (new) offer opens the popup — keyed on
  // `offer` (not just `open`) so switching offers while it's open also resets.
  useEffect(() => {
    if (offer) setPhase('feedback');
  }, [offer]);

  function handleClose() {
    setPhase('feedback');
    onClose();
  }

  function handleYes() {
    setCrossSell(pickCrossSell(featured, offer?.siteSlug));
    setPhase('thanks');
  }

  // Offer summary shown in the feedback question so it's clear which deal we're asking about.
  const offerDiscount =
    offer && offer.price != null && offer.fullPrice != null
      ? getDiscountPercent({ price: offer.price, full_price: offer.fullPrice })
      : null;
  const offerTypeLabel =
    offer?.offerKind === 'credits'
      ? offer.credits
        ? `${offer.credits} ${td('credits')}`
        : null
      : offer?.offerType && offer.offerType !== 'credits'
        ? td(offer.offerType as Parameters<typeof td>[0])
        : null;

  return (
    <PopoverSheet title={t('feedbackTitle')} forceOpen={open} onClose={handleClose}>
      {phase === 'feedback' && (
        <div className="space-y-4">
          {offer && (offer.siteName || offer.price != null) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800/50">
              {offer.siteName && (
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{offer.siteName}</p>
              )}
              <div className="mt-1 flex items-center justify-center gap-2">
                {offerTypeLabel && (
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{offerTypeLabel}</span>
                )}
                {offer.price != null && (
                  <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                    ${offer.price.toFixed(2)}
                  </span>
                )}
                {offer.fullPrice != null && offer.price != null && offer.fullPrice > offer.price && (
                  <span className="text-sm text-slate-400 line-through">${offer.fullPrice.toFixed(2)}</span>
                )}
                {offerDiscount !== null && offerDiscount > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    {td('percentOff', { percentage: offerDiscount })}
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center justify-center gap-3 py-1">
            <button
              type="button"
              onClick={handleYes}
              className="rounded-xl bg-emerald-600 px-8 py-3 text-base font-bold text-white transition hover:bg-emerald-700 active:scale-95"
            >
              {t('feedbackYes')}
            </button>
            <button
              type="button"
              onClick={() => setPhase('sorry')}
              className="rounded-xl border border-slate-200 bg-white px-8 py-3 text-base font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              {t('feedbackNo')}
            </button>
          </div>
        </div>
      )}

      {phase === 'thanks' && (
        <div className="text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
            <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="mb-4 text-lg font-bold text-slate-900 dark:text-white">{t('feedbackThanks')}</p>

          {crossSell ? (
            <>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{t('crossSellHeading')}</p>
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left dark:border-emerald-800 dark:bg-emerald-900/20">
                {crossSell.imageUrl && (
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white dark:bg-slate-800">
                    <Image
                      src={crossSell.imageUrl}
                      alt={crossSell.name}
                      width={56}
                      height={56}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-slate-900 dark:text-white">{crossSell.name}</p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                    {crossSell.price != null && (
                      <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                        ${crossSell.price.toFixed(2)}
                      </span>
                    )}
                    {crossSell.fullPrice != null && crossSell.price != null && crossSell.fullPrice > crossSell.price && (
                      <span className="text-sm text-slate-400 line-through">${crossSell.fullPrice.toFixed(2)}</span>
                    )}
                    {crossSell.discountPercent != null && crossSell.discountPercent > 0 && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                        {td('percentOff', { percentage: crossSell.discountPercent })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                >
                  {t('noThanks')}
                </button>
                <Link
                  href={routes.site(crossSell.slug)}
                  onClick={handleClose}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-emerald-700 active:scale-95 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                >
                  {t('viewDeal')}
                </Link>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3 text-base font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              {t('noThanks')}
            </button>
          )}
        </div>
      )}

      {phase === 'sorry' && (
        <div className="py-2 text-center">
          <p className="mb-4 text-base text-slate-600 dark:text-slate-300">{t('feedbackSorry')}</p>
          <a
            href={`mailto:${siteSettings.supportEmail}`}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3 text-base font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            {t('contactSupport')}
          </a>
        </div>
      )}
    </PopoverSheet>
  );
}
