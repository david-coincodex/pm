'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface CardCarouselProps {
  /** Pre-rendered snap items (one wrapper div per card). */
  children: ReactNode;
  /** Desktop (lg+) grid column count. */
  columns: number;
  /** Number of cards — drives the mobile dot indicator. */
  count: number;
  variant?: 'light' | 'dark';
  /** Tailwind bg class(es) for the active dot. Defaults to the brand green. */
  activeDotClassName?: string;
}

/**
 * Mobile/tablet: horizontal snap-scroll, one card per swipe (a sliver of the next peeks).
 * A dot indicator below tracks the active card and lets users tap to jump.
 * Desktop (lg+): the inner row becomes a static CSS grid (no scroll, no dots).
 */
export default function CardCarousel({ children, columns, count, variant, activeDotClassName }: CardCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const cards = Array.from(el.children) as HTMLElement[];
      if (!cards.length) return;
      // Use viewport coords (getBoundingClientRect) for both scroller and cards so the
      // math is independent of offsetParent — offsetLeft breaks when an ancestor is positioned.
      const viewportCenter = el.getBoundingClientRect().left + el.clientWidth / 2;
      let idx = 0;
      let best = Infinity;
      cards.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - viewportCenter);
        if (d < best) {
          best = d;
          idx = i;
        }
      });
      setActive(idx);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [count]);

  const scrollToCard = (i: number) => {
    const card = scrollerRef.current?.children[i] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  const isDark = variant === 'dark';

  return (
    <div>
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3
                   -mx-4 px-4 scroll-pl-4 sm:-mx-6 sm:px-6 sm:scroll-pl-6
                   [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
                   lg:mx-0 lg:grid lg:snap-none lg:overflow-visible lg:pb-0 lg:px-0 lg:gap-6"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {children}
      </div>

      {count > 1 && (
        <div className="mt-3 flex justify-center gap-2 lg:hidden">
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to card ${i + 1}`}
              aria-current={i === active}
              onClick={() => scrollToCard(i)}
              className={`h-2 rounded-full transition-all ${
                i === active
                  ? `w-5 ${activeDotClassName ?? 'bg-emerald-600 dark:bg-emerald-400'}`
                  : `w-2 ${isDark ? 'bg-white/30' : 'bg-slate-300 dark:bg-slate-600'}`
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
