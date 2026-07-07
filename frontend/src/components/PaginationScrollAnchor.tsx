'use client';

import { useEffect, useRef } from 'react';

/**
 * Scrolls to the top of a paginated list when the page changes. Render this once,
 * immediately above any list that is paged via <Pagination>, passing the same
 * `page` the server component computed. Mobile lands near the list top; desktop
 * scrolls higher to reveal the section heading (controlled by scroll-mt below).
 */
export default function PaginationScrollAnchor({ page }: { page: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const prevPage = useRef<number | null>(null);

  useEffect(() => {
    // Skip the first render (page load / deep-link) — only react to real changes.
    if (prevPage.current !== null && prevPage.current !== page) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      ref.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
    prevPage.current = page;
  }, [page]);

  // scroll-mt = where the list top lands below the *sticky header* (56px mobile /
  // 64px desktop — see Header.tsx / NavMenu.tsx).
  //   Mobile: 80px = 56px header + a small gap → list top sits just under the header.
  //   Desktop (md+): 208px pushes the list down far enough that the H1/subtitle
  //   sit fully below the 64px header (revealing the heading, not hiding it behind it).
  return <div ref={ref} aria-hidden="true" className="scroll-mt-20 md:scroll-mt-52" />;
}
