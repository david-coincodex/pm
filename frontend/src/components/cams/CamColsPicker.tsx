'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import {
  getCols,
  getMobileCols,
  getServerCols,
  getServerMobileCols,
  setCols,
  setMobileCols,
  subscribeCols,
  type CamCols,
  type CamColsMobile,
} from '@/lib/cams/gridCols';

const DESKTOP_OPTIONS: CamCols[] = [3, 4, 5, 6];
const MOBILE_OPTIONS: CamColsMobile[] = [1, 2];

/** A miniature of the grid itself: an n×n field of boxes in a FIXED outer frame — every icon
 * fills the same 16-unit square, only the density changes (finer boxes = more per row). */
function ColsIcon({ n }: { n: number }) {
  const size = 16;
  const gap = 1.5;
  const cell = (size - gap * (n - 1)) / n;
  const cells: { x: number; y: number }[] = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) cells.push({ x: col * (cell + gap), y: row * (cell + gap) });
  }
  return (
    <svg className="h-4 w-4" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {cells.map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width={cell} height={cell} rx={n > 4 ? 0.5 : 1} fill="currentColor" />
      ))}
    </svg>
  );
}

const segmentClass = (active: boolean) =>
  `border-l border-slate-300 px-2.5 py-1.5 transition first:border-l-0 dark:border-slate-600 ${
    active
      ? 'bg-emerald-600 text-white dark:bg-emerald-500'
      : 'bg-white text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:bg-slate-800 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300'
  }`;

/**
 * Cams-per-row segmented control. Below lg the choices are 1 or 2 per row; lg+ offers 3–6.
 * Clicking the active count again returns to the automatic default. Both preferences persist
 * (gridCols store) and drive every CamGrid on the page.
 */
export default function CamColsPicker() {
  const t = useTranslations('liveSex');
  const cols = useSyncExternalStore(subscribeCols, getCols, getServerCols);
  const mobile = useSyncExternalStore(subscribeCols, getMobileCols, getServerMobileCols);

  return (
    <>
      {/* Mobile: 1 or 2 per row */}
      <span
        role="group"
        aria-label={t('camsPerRow')}
        title={t('camsPerRow')}
        className="inline-flex items-center overflow-hidden rounded-full border border-slate-300 dark:border-slate-600 lg:hidden"
      >
        {MOBILE_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setMobileCols(mobile === n ? 0 : n)}
            aria-pressed={mobile === n || (mobile === 0 && n === 1)}
            aria-label={t('perRow', { count: n })}
            title={t('perRow', { count: n })}
            className={segmentClass(mobile === n || (mobile === 0 && n === 1))}
          >
            <ColsIcon n={n} />
          </button>
        ))}
      </span>
      {/* Desktop: 3–6 per row */}
      <span
        role="group"
        aria-label={t('camsPerRow')}
        title={t('camsPerRow')}
        className="hidden items-center overflow-hidden rounded-full border border-slate-300 dark:border-slate-600 lg:inline-flex"
      >
        {DESKTOP_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setCols(cols === n ? 0 : n)}
            aria-pressed={cols === n}
            aria-label={t('perRow', { count: n })}
            title={t('perRow', { count: n })}
            className={segmentClass(cols === n)}
          >
            <ColsIcon n={n} />
          </button>
        ))}
      </span>
    </>
  );
}
