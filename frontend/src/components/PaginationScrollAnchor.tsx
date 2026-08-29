'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Scrolls to the top of a paginated list when the page changes. Render this once,
 * immediately above any list that is paged via <Pagination>, passing the same
 * `page` the server component computed. Mobile lands near the list top; desktop
 * scrolls higher to reveal the section heading (controlled by scroll-mt below).
 *
 * The previous page lives in a MODULE-level map keyed by pathname, not a ref: listings whose
 * ?page= the proxy rewrites into a path param (the cam pages) remount this component on every
 * page change, and a ref-based "previous" resets to null each time — the change would be
 * swallowed as a first render. The map survives remounts for the SPA session; a hard load or
 * deep link starts with no entry and correctly does not scroll. Keys are pathname + scope
 * (listings can share a pathname: hub and filter both live on /live-sex/), and entries expire
 * after a few minutes so a much-later fresh arrival never scroll-jumps.
 */
const lastPageByList = new Map<string, { page: number; at: number }>();
/** Page changes further apart than this are a fresh arrival, not pagination — don't scroll. */
const SESSION_WINDOW_MS = 5 * 60 * 1000;

export default function PaginationScrollAnchor({ page, scope = '' }: { page: number; scope?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    // scope keeps listings that share a pathname apart (the hub and the filter route both
    // live on /live-sex/ in the browser); the time window keeps a later fresh arrival at
    // page 1 from scroll-jumping because the map still remembers page 3 from earlier.
    const key = `${pathname}#${scope}`;
    const prev = lastPageByList.get(key);
    if (prev !== undefined && prev.page !== page && Date.now() - prev.at < SESSION_WINDOW_MS) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      ref.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
    lastPageByList.set(key, { page, at: Date.now() });
  }, [page, pathname, scope]);

  // scroll-mt = where the list top lands below the *sticky header* (56px mobile /
  // 64px desktop — see Header.tsx / NavMenu.tsx).
  //   Mobile: 80px = 56px header + a small gap → list top sits just under the header.
  //   Desktop (md+): 208px pushes the list down far enough that the H1/subtitle
  //   sit fully below the 64px header (revealing the heading, not hiding it behind it).
  return <div ref={ref} aria-hidden="true" className="scroll-mt-20 md:scroll-mt-52" />;
}
