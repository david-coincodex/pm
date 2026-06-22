'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { strapiMediaUrl, type Offer, type Site } from '@/lib/strapi';

const COUNTDOWN = 3;

interface OfferRedirectProps {
  offer: Offer & { site: Site };
}

export default function OfferRedirect({ offer }: OfferRedirectProps) {
  const t = useTranslations('offer');
  const [count, setCount] = useState(COUNTDOWN);
  const [gone, setGone] = useState(false);

  const site = offer.site;
  const saving = (offer.full_price ?? 0) - offer.price;
  const hasSaving = saving > 0;
  const image = site.cover_image ?? site.logo;

  useEffect(() => {
    if (count <= 0) {
      setGone(true);
      window.location.href = offer.affiliateLink;
      return;
    }
    const timer = setTimeout(() => setCount((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, offer.affiliateLink]);

  // Fraction of the circle filled (goes from 1 → 0)
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = count / COUNTDOWN;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      {/* Site image */}
      {image && (
        <div className="h-20 w-20 overflow-hidden rounded-2xl bg-slate-100 shadow-md dark:bg-slate-800">
          <Image
            src={strapiMediaUrl(image)}
            alt={image.alternativeText ?? site.name}
            width={80}
            height={80}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {/* Site name + savings / credits info */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {site.name}
        </h1>
        {offer.offerKind === 'credits' && offer.credits ? (
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {offer.credits} {t('credits')} — ${offer.price.toFixed(2)}
          </p>
        ) : hasSaving ? (
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {t('saving', {
              amount: saving.toFixed(2),
              currency: 'USD',
            })}
          </p>
        ) : null}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('redirecting')}
        </p>
      </div>

      {/* Animated countdown ring */}
      <div className="relative flex h-24 w-24 items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 88 88" aria-hidden="true">
          {/* Track */}
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-slate-200 dark:text-slate-700"
          />
          {/* Progress arc */}
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            className="text-emerald-600 transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <span className="text-4xl font-extrabold tabular-nums text-slate-900 dark:text-white">
          {count}
        </span>
      </div>

      {/* Manual link in case redirect is blocked */}
      {!gone && (
        <a
          href={offer.affiliateLink}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="rounded-xl bg-emerald-600 px-8 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-600"
        >
          {t('goNow')}
        </a>
      )}

      {/* Affiliate disclaimer */}
      <p className="max-w-sm text-xs text-slate-400 dark:text-slate-500">
        {t('disclaimer')}
      </p>
    </div>
  );
}
