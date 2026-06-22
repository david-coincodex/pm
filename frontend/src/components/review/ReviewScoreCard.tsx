'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { routes } from '@/lib/routes';

interface ScoreEntry {
  key: string;
  label: string;
  value: number;
}

interface BestOffer {
  id: number;
  price: number;
  full_price: number | null;
  offerType: string | null;
}

interface ReviewScoreCardProps {
  overall: number;
  entries: ScoreEntry[];
  bestOffer?: BestOffer | null;
  /** Highest discount % across the site's active offers (shown as a badge). */
  discountPercent?: number | null;
  siteSlug?: string | null;
}

function scoreBarColor(score: number): string {
  if (score >= 8) return 'bg-emerald-600';
  if (score >= 6) return 'bg-amber-400';
  return 'bg-red-400';
}

function scoreColor(score: number): string {
  if (score >= 8) return '#059669'; // emerald-600 (brand green)
  if (score >= 6) return '#f59e0b'; // amber-400
  return '#ef4444'; // red-400
}

function ScoreRow({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700 dark:text-slate-300">{label}</span>
        <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{score}/10</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-1.5 rounded-full transition-all ${scoreBarColor(score)}`}
          style={{ width: `${score * 10}%` }}
        />
      </div>
    </div>
  );
}

const INITIAL_VISIBLE = 4;

export default function ReviewScoreCard({ overall, entries, bestOffer, discountPercent, siteSlug }: ReviewScoreCardProps) {
  const t = useTranslations('reviews');
  const td = useTranslations('discount');
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? entries : entries.slice(0, INITIAL_VISIBLE);
  const hasMore = entries.length > INITIAL_VISIBLE;

  const color = scoreColor(overall);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      {/* Overall score: star + large number */}
      <div className="mb-5 flex flex-col items-center gap-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {t('overallScore')}
        </p>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-9 w-9" style={{ color }} aria-hidden="true">
            <path d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" />
          </svg>
          <span className="text-5xl font-black tabular-nums leading-none" style={{ color }}>
            {overall}
          </span>
          <span className="self-end pb-1 text-base font-semibold text-slate-400 dark:text-slate-500">/10</span>
        </div>
      </div>

      {/* Score rows — two columns */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {visible.map((e) => (
            <ScoreRow key={e.key} label={e.label} score={e.value} />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="col-span-2 mt-1 w-full rounded-lg py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              {expanded ? t('showLess') : t('showMore', { count: entries.length - INITIAL_VISIBLE })}
            </button>
          )}
        </div>
      )}

      {/* Pricing + CTA */}
      {bestOffer && (
        <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-700">
          {discountPercent != null && discountPercent > 0 && (
            <div className="mb-2 flex justify-center">
              <span className="rounded-full bg-emerald-600 px-3 py-1 text-sm font-bold text-white dark:bg-emerald-600">
                {td('percentOff', { percentage: discountPercent })}
              </span>
            </div>
          )}
          <div className="mb-4 flex flex-wrap items-baseline justify-center gap-x-2">
            <span className="text-sm text-slate-500 dark:text-slate-400">{td('from')}</span>
            {bestOffer.full_price && bestOffer.full_price > bestOffer.price && (
              <span className="text-base text-slate-400 line-through dark:text-slate-500">
                ${bestOffer.full_price.toFixed(2)}
              </span>
            )}
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
              ${bestOffer.price.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {siteSlug && (
              <Link
                href={routes.site(siteSlug)}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                {t('viewDeal')}
              </Link>
            )}
            <Link
              href={routes.offer(bestOffer.id)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow transition hover:bg-emerald-700"
            >
              {t('buyNow')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
