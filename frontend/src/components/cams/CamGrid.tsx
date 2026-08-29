'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import {
  getCols,
  getMobileCols,
  getServerCols,
  getServerMobileCols,
  subscribeCols,
} from '@/lib/cams/gridCols';

/**
 * The one grid definition for model cards. The full-width layout is the whole point of
 * /live-sex/ — density climbs to 6 columns.
 *
 * Desktop density is the VISITOR'S choice (CamColsPicker → gridCols store): a fixed lg+ count
 * when they picked one, the responsive ladder otherwise. Cards stay server-rendered children;
 * this client wrapper only swaps grid classes after hydration (server always renders auto).
 */
const COLS_CLASSES: Record<number, string> = {
  0: 'lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};
/** Below lg the visitor picks 1 or 2 per row (the picker is lg:hidden). 0 = the auto ladder
 * (2 → 3 at sm); an explicit choice holds all the way to lg, where COLS_CLASSES takes over. */
const MOBILE_CLASSES: Record<number, string> = {
  0: 'grid-cols-1 sm:grid-cols-2',
  1: 'grid-cols-1 sm:grid-cols-1',
  2: 'grid-cols-2 sm:grid-cols-2',
};

export function CamGrid({ children }: { children: ReactNode }) {
  const cols = useSyncExternalStore(subscribeCols, getCols, getServerCols);
  const mobile = useSyncExternalStore(subscribeCols, getMobileCols, getServerMobileCols);
  // Mobile classes govern below lg; COLS_CLASSES (all lg:-prefixed) govern lg+.
  return <div className={`grid ${MOBILE_CLASSES[mobile]} gap-3 ${COLS_CLASSES[cols]}`}>{children}</div>;
}
