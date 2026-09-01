'use client';

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { bucketLocalOccupancy, type SessionPair } from '@/lib/cams/activity';
import Tooltip, { TooltipBubble } from '@/components/ui/Tooltip';

/**
 * The visitor's clock as an external store, minute-granular. Hydration-safe by construction:
 * the server snapshot is null (zero grid, no marker — no mismatch), the client snapshot is
 * the current epoch minute, and the subscription re-renders each minute so the "now" marker
 * crosses hour boundaries during long sessions.
 */
function subscribeMinute(onTick: () => void) {
  const id = setInterval(onTick, 60_000);
  return () => clearInterval(id);
}
const clientMinute = (): number | null => Math.floor(Date.now() / 60_000);
const serverMinute = (): number | null => null;

/**
 * "Usual online hours": the model's last 28 days of recorded sessions bucketed by weekday ×
 * hour, in the VISITOR'S timezone — which is why this is a client component. The server (and
 * first client) render paints the all-zero grid; the real buckets land after mount, when the
 * browser's local Date is available. Grid dimensions never change, so there is no hydration
 * mismatch and no layout shift — cells just gain color.
 *
 * Two orientations, chosen by viewport: the desktop sidebar rail is 270px wide, so days run
 * across the top and hours down (7 × 24 fits the narrow column); the mobile sidebar spans the
 * full content width, where the classic days-as-rows layout (24 across) reads better. Both
 * are rendered and toggled with visibility classes — the component can't know which sidebar
 * copy it sits in.
 *
 * Plain CSS grid, no chart dependency. Exact values live in the hover tooltip (hover-only is
 * fine: the sr-only summary carries the peak for everyone else).
 */
export default function CamActivityHeatmap({ activity }: { activity: SessionPair[] }) {
  const t = useTranslations('liveSex');
  const locale = useLocale();
  const nowMinute = useSyncExternalStore(subscribeMinute, clientMinute, serverMinute);
  const buckets = useMemo(
    () => (nowMinute === null ? null : bucketLocalOccupancy(activity, nowMinute * 60_000)),
    [activity, nowMinute],
  );
  // The visitor's current weekday-hour cell, marked in the grid (null on the server render).
  const nowIdx = useMemo(() => {
    if (nowMinute === null) return null;
    const d = new Date(nowMinute * 60_000);
    return ((d.getDay() + 6) % 7) * 24 + d.getHours();
  }, [nowMinute]);

  // Monday-first to match the bucketing (2024-01-01 is a Monday; UTC pins the label dates).
  const dayNames = useMemo(() => {
    const short = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    const long = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(Date.UTC(2024, 0, 1 + i));
      return { short: short.format(date), long: long.format(date) };
    });
  }, [locale]);

  // Localized clock labels for the tooltip: "13:00" under de/…, "1:00 PM" under en.
  const hourLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    return Array.from({ length: 24 }, (_, h) => fmt.format(new Date(Date.UTC(2024, 0, 1, h))));
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
    <section className="flex flex-col gap-2">
      {/* A <p>, not a heading: the sidebar precedes the page's H1 in DOM order (same
          reasoning as CamSiteOffer's label). */}
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {t('usualOnlineHours')}
        {/* Methodology note lives in the (?) tooltip instead of a caption line. align=start:
            the title hugs the rail's left edge, a centered bubble would clip the viewport. */}
        <Tooltip content={t('heatmapLocalTime')} align="start">
          <span
            tabIndex={0}
            aria-label={t('heatmapLocalTime')}
            className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-400 dark:border-slate-600 dark:text-slate-500"
          >
            ?
          </span>
        </Tooltip>
      </p>
      {/* Desktop rail: days on top, hours down — the vertical shape leaves room for the card
          border; mobile stays borderless to save width. */}
      <HeatGrid
        vertical
        className="hidden rounded-xl border border-slate-200 bg-white p-3 lg:block dark:border-slate-700 dark:bg-slate-800"
        pct={pct}
        dayNames={dayNames}
        hourLabels={hourLabels}
        nowIdx={nowIdx}
      />
      {/* Mobile / full-width sidebar: days as rows, hours across. */}
      <HeatGrid className="lg:hidden" pct={pct} dayNames={dayNames} hourLabels={hourLabels} nowIdx={nowIdx} />
      {peak && (
        <p className="sr-only">{t('heatmapSummary', { day: dayNames[peak.day].long, hour: peak.hour })}</p>
      )}
    </section>
  );
}

type DayName = { short: string; long: string };

function HeatGrid({
  vertical = false,
  className,
  pct,
  dayNames,
  hourLabels,
  nowIdx,
}: {
  vertical?: boolean;
  className: string;
  pct: number[];
  dayNames: DayName[];
  hourLabels: string[];
  nowIdx: number | null;
}) {
  const t = useTranslations('liveSex');
  const boxRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ d: number; h: number; x: number; y: number } | null>(null);

  // Touch has no hover, so mouseleave never fires there — a tap outside the grid dismisses.
  const open = tip !== null;
  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setTip(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  // Tooltip anchoring: cell centers, measured against the relative wrapper (the cells'
  // offsetParent), horizontally clamped so edge columns don't overflow the sidebar.
  const show = (cell: HTMLDivElement, d: number, h: number) => {
    const width = boxRef.current?.clientWidth ?? 270;
    const x = Math.min(Math.max(cell.offsetLeft + cell.offsetWidth / 2, 70), width - 70);
    setTip({ d, h, x, y: cell.offsetTop });
  };

  const cell = (d: number, h: number, shapeClass: string) => (
    <div
      key={`${d}-${h}`}
      onMouseEnter={(e) => show(e.currentTarget, d, h)}
      // Mobile: no hover — the tap itself opens the tooltip (some browsers emulate mouseenter
      // on tap, but not all, and never reliably; the click handler is the guarantee).
      onClick={(e) => show(e.currentTarget, d, h)}
      className={`${shapeClass} cursor-default rounded-xs ${BIN_CLASSES[bin(pct[d * 24 + h])]}${
        // "You are here": neutral ink ring — high contrast on every ramp step in both modes,
        // without borrowing a hue the cells (emerald) or statuses already own.
        nowIdx === d * 24 + h ? ' relative z-[1] ring-2 ring-slate-900 dark:ring-white' : ''
      }`}
    />
  );

  const axisText = 'text-xs leading-none text-slate-400 dark:text-slate-500';

  return (
    <div ref={boxRef} className={`relative ${className}`} onMouseLeave={() => setTip(null)}>
      {vertical ? (
        <div className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] gap-0.5" aria-hidden="true">
          <div />
          {dayNames.map((day) => (
            <div key={day.short} className={`pb-1 text-center font-medium ${axisText}`}>
              {day.short}
            </div>
          ))}
          {Array.from({ length: 24 }, (_, h) => (
            <Fragment key={h}>
              <div className={`self-center pr-1.5 text-right ${axisText}`}>{h % 6 === 0 ? h : ''}</div>
              {dayNames.map((_, d) => cell(d, h, 'h-3 w-full'))}
            </Fragment>
          ))}
          {/* Closing boundary label: the 23-row starts at 23:00; 24 marks midnight's end. */}
          <div className={`pr-1.5 pt-1 text-right ${axisText}`}>24</div>
          <div className="col-span-7" />
        </div>
      ) : (
        <div className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-0.5" aria-hidden="true">
          {dayNames.map((day, d) => (
            <Fragment key={day.short}>
              <div className={`self-center pr-1.5 text-right font-medium ${axisText}`}>{day.short}</div>
              {Array.from({ length: 24 }, (_, h) => cell(d, h, 'aspect-square w-full'))}
            </Fragment>
          ))}
          <div />
          {[0, 6, 12, 18].map((h) => (
            <div key={h} className={`relative col-span-6 pt-1 ${axisText}`}>
              {h}
              {/* Closing boundary label at the grid's right edge. */}
              {h === 18 && <span className="absolute right-0">24</span>}
            </div>
          ))}
        </div>
      )}
      {tip && (
        <TooltipBubble className="absolute -translate-x-1/2 -translate-y-full" style={{ left: tip.x, top: tip.y - 6 }}>
          <span className="font-semibold">
            {dayNames[tip.d].long}, {hourLabels[tip.h]}
          </span>
          <span className="block text-white/70">
            {t('heatmapFrequency', { percent: Math.round(pct[tip.d * 24 + tip.h] * 100) })}
          </span>
        </TooltipBubble>
      )}
    </div>
  );
}

const ZERO_BUCKETS = new Array<number>(7 * 24).fill(0);

/* Absolute occupancy bins; static class strings so Tailwind's scanner sees them. Lightness is
   monotonic in both modes (dark flips the anchor so zero recedes into the page surface). */
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
