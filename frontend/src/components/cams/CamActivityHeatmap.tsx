'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { bucketLocalOccupancy, type SessionPair } from '@/lib/cams/activity';

/**
 * "Usual online hours": 7 weekday rows × 24 hour columns over the model's last 28 days of
 * recorded sessions, in the VISITOR'S timezone — which is why this is a client component. The
 * server (and first client) render paints the all-zero grid; the real buckets land after
 * mount, when the browser's local Date is available. Grid dimensions never change, so there
 * is no hydration mismatch and no layout shift — cells just gain color.
 *
 * Plain CSS grid, no chart dependency: ~170 divs is nothing, and the sidebar rail is 270px.
 */
export default function CamActivityHeatmap({ activity }: { activity: SessionPair[] }) {
  const t = useTranslations('liveSex');
  const locale = useLocale();
  const [buckets, setBuckets] = useState<number[] | null>(null);

  useEffect(() => {
    setBuckets(bucketLocalOccupancy(activity, Date.now()));
  }, [activity]);

  // Monday-first to match the bucketing (2024-01-01 is a Monday; UTC pins the label dates).
  const dayNames = useMemo(() => {
    const short = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    const long = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(Date.UTC(2024, 0, 1 + i));
      return { short: short.format(date), long: long.format(date) };
    });
  }, [locale]);

  const pct = buckets ?? ZERO_BUCKETS;
  const peak = useMemo(() => {
    let best = 0;
    let bestIdx = -1;
    for (let i = 0; i < pct.length; i++) {
      if (pct[i] > best) {
        best = pct[i];
        bestIdx = i;
      }
    }
    return bestIdx >= 0 ? { day: Math.floor(bestIdx / 24), hour: bestIdx % 24 } : null;
  }, [pct]);

  return (
    <section className="flex flex-col gap-3">
      {/* A <p>, not a heading: the sidebar precedes the page's H1 in DOM order (same
          reasoning as CamSiteOffer's label). */}
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {t('usualOnlineHours')}
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        {/* Color is the only signal inside the grid, so keep it out of the accessibility
            tree and narrate the peak in text instead. */}
        <div className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-px" aria-hidden="true">
          {dayNames.map((day, d) => (
            <div key={day.short} className="contents">
              <div className="pr-1.5 text-right text-[9px] leading-none text-slate-400 dark:text-slate-500 self-center">
                {day.short}
              </div>
              {Array.from({ length: 24 }, (_, h) => {
                const value = pct[d * 24 + h];
                return (
                  <div
                    key={h}
                    className={`aspect-square rounded-[2px] ${BIN_CLASSES[bin(value)]}`}
                    title={t('heatmapCell', {
                      day: day.long,
                      start: h,
                      end: (h + 1) % 24,
                      percent: Math.round(value * 100),
                    })}
                  />
                );
              })}
            </div>
          ))}
          <div />
          {/* Hour axis: sparse labels, each spanning its 6-column block. */}
          {[0, 6, 12, 18].map((h) => (
            <div key={h} className="col-span-6 pt-0.5 text-[9px] leading-none text-slate-400 dark:text-slate-500">
              {h}
            </div>
          ))}
        </div>
        {peak && (
          <p className="sr-only">{t('heatmapSummary', { day: dayNames[peak.day].long, hour: peak.hour })}</p>
        )}
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
          <span>{t('heatmapLocalTime')}</span>
          <span className="flex items-center gap-1" aria-hidden="true">
            {t('heatmapLess')}
            {BIN_CLASSES.map((cls) => (
              <span key={cls} className={`h-2 w-2 rounded-[2px] ${cls}`} />
            ))}
            {t('heatmapMore')}
          </span>
        </div>
      </div>
    </section>
  );
}

const ZERO_BUCKETS = new Array<number>(7 * 24).fill(0);

/* Absolute occupancy bins; static class strings so Tailwind's scanner sees them. Lightness is
   monotonic in both modes (dark flips the anchor so zero recedes into the card surface). */
const BIN_CLASSES = [
  'bg-slate-100 dark:bg-slate-700/60',
  'bg-emerald-200 dark:bg-emerald-900',
  'bg-emerald-300 dark:bg-emerald-700',
  'bg-emerald-500 dark:bg-emerald-500',
  'bg-emerald-700 dark:bg-emerald-400',
];

function bin(value: number): number {
  if (value <= 0) return 0;
  if (value <= 0.25) return 1;
  if (value <= 0.5) return 2;
  if (value <= 0.75) return 3;
  return 4;
}
