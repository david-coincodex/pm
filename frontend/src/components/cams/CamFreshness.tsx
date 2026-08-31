'use client';

import { useEffect, useRef } from 'react';
// Plain next/navigation on purpose: refresh() re-renders the current URL, no locale semantics.
import { useRouter } from 'next/navigation';

/** Floor between refreshes — also what makes rapid tab-switching cost nothing. */
const MIN_REFRESH_MS = 60_000;

/**
 * Keeps an already-open page live. Renders nothing.
 *
 * The server side can be as fresh as it likes — a tab someone left open (or a page the browser
 * restored from bfcache after hours) still shows the world as it was when it rendered, and
 * that is exactly what "I opened the site and the models are offline" looks like. Every minute
 * while the tab is visible — and immediately when it BECOMES visible again — this re-requests
 * the server render via router.refresh(): server components re-render from the current
 * snapshot, while client state (favorites, scroll position, an open drawer) survives untouched.
 *
 * Cost: one RSC-payload request per visible tab per minute, usually answered by the ISR cache.
 */
export default function CamFreshness() {
  const router = useRouter();
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    // The page was just server-rendered — it IS fresh at mount, so the clock starts here
    // (not in render: impure calls there break with React Compiler memoization).
    lastRefreshRef.current = Date.now();
    const refreshIfDue = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshRef.current < MIN_REFRESH_MS) return;
      lastRefreshRef.current = Date.now();
      router.refresh();
    };
    // The interval fires twice per MIN_REFRESH window so a due refresh waits ≤30s, not ≤60s.
    const interval = setInterval(refreshIfDue, MIN_REFRESH_MS / 2);
    document.addEventListener('visibilitychange', refreshIfDue);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfDue);
    };
  }, [router]);

  return null;
}
