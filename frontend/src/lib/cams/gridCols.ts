/**
 * The visitor's cams-per-row preference (desktop): a module-singleton store shared by the
 * picker buttons and every CamGrid on the page, persisted to localStorage. 0 means "auto" —
 * the responsive default ladder. Read through useSyncExternalStore: the server snapshot is
 * always auto, the client re-reads after hydration, so prerendered pages stay static and
 * hydrate without mismatch.
 */
export type CamCols = 0 | 3 | 4 | 5 | 6;
/** Mobile (below sm): 1 or 2 cards per row; 0 = auto (2). */
export type CamColsMobile = 0 | 1 | 2;

const KEY = 'pm_cam_cols';
const KEY_MOBILE = 'pm_cam_cols_m';
const VALID = new Set([3, 4, 5, 6]);
const VALID_MOBILE = new Set([1, 2]);

let current: CamCols | null = null;
let currentMobile: CamColsMobile | null = null;
const listeners = new Set<() => void>();

function read(): CamCols {
  if (current === null) {
    try {
      const v = Number(window.localStorage.getItem(KEY));
      current = VALID.has(v) ? (v as CamCols) : 0;
    } catch {
      current = 0;
    }
  }
  return current;
}

export const getCols = (): CamCols => read();
export const getServerCols = (): CamCols => 0;

export function setCols(v: CamCols): void {
  current = v;
  try {
    window.localStorage.setItem(KEY, String(v));
  } catch {
    // Private mode etc. — the choice still applies for this page's lifetime.
  }
  listeners.forEach((l) => l());
}

export function subscribeCols(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readMobile(): CamColsMobile {
  if (currentMobile === null) {
    try {
      const v = Number(window.localStorage.getItem(KEY_MOBILE));
      currentMobile = VALID_MOBILE.has(v) ? (v as CamColsMobile) : 0;
    } catch {
      currentMobile = 0;
    }
  }
  return currentMobile;
}

export const getMobileCols = (): CamColsMobile => readMobile();
export const getServerMobileCols = (): CamColsMobile => 0;

export function setMobileCols(v: CamColsMobile): void {
  currentMobile = v;
  try {
    window.localStorage.setItem(KEY_MOBILE, String(v));
  } catch {
    // Private mode etc. — the choice still applies for this page's lifetime.
  }
  listeners.forEach((l) => l());
}
