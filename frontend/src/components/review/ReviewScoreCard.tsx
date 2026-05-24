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
  siteSlug?: string | null;
}

function scoreBarColor(score: number): string {
  if (score >= 8) return 'bg-emerald-500';
  if (score >= 6) return 'bg-amber-400';
  return 'bg-red-400';
}

function ringColor(score: number): string {
  if (score >= 8) return '#10b981'; // emerald-500
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

const INITIAL_VISIBLE = 3;
const SIZE = 96;
const STROKE = 8;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

export default function ReviewScoreCard({ overall, entries, bestOffer, siteSlug }: ReviewScoreCardProps) {
  const t = useTranslations('reviews');
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? entries : entries.slice(0, INITIAL_VISIBLE);
  const hasMore = entries.length > INITIAL_VISIBLE;

  const pct = overall / 10; // 0–1
  const dash = pct * CIRCUMFERENCE;
  const color = ringColor(overall);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      {/* Ring score */}
      <div className="mb-5 flex flex-col items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {t('overallScore')}
        </p>
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} className="-rotate-90">
            {/* Track */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              className="text-slate-200 dark:text-slate-700"
            />
            {/* Progress */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-black tabular-nums leading-none" style={{ color }}>
              {overall}
            </span>
          </div>
        </div>
      </div>

      {/* Score rows */}
      {entries.length > 0 && (
        <div className="space-y-3">
          {visible.map((e) => (
            <ScoreRow key={e.key} label={e.label} score={e.value} />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 w-full rounded-lg py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              {expanded ? t('showLess') : t('showMore', { count: entries.length - INITIAL_VISIBLE })}
            </button>
          )}
        </div>
      )}

      {/* Pricing + CTA */}
      {bestOffer && (
        <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-700">
          <div className="mb-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
              ${bestOffer.price.toFixed(2)}
            </span>
            {bestOffer.full_price && bestOffer.full_price > bestOffer.price && (
              <span className="text-sm text-slate-400 line-through dark:text-slate-500">
                ${bestOffer.full_price.toFixed(2)}
              </span>
            )}
            {bestOffer.offerType && (
              <span className="text-xs text-slate-500 dark:text-slate-400">/{bestOffer.offerType}</span>
            )}
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
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow transition hover:bg-emerald-500"
            >
              {t('buyNow')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
