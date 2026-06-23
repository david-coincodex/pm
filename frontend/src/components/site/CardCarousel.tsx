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
}

/**
 * Mobile/tablet: horizontal snap-scroll, one card per swipe (a sliver of the next peeks).
 * A dot indicator below tracks the active card and lets users tap to jump.
 * Desktop (lg+): the inner row becomes a static CSS grid (no scroll, no dots).
 */
export default function CardCarousel({ children, columns, count, variant }: CardCarouselProps) {
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
      const viewportCenter = el.scrollLeft + el.clientWidth / 2;
      let idx = 0;
      let best = Infinity;
      cards.forEach((c, i) => {
        const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - viewportCenter);
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
                   [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
                   lg:grid lg:snap-none lg:overflow-visible lg:pb-0 lg:gap-6"
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
                  ? 'w-5 bg-emerald-600 dark:bg-emerald-400'
                  : `w-2 ${isDark ? 'bg-white/30' : 'bg-slate-300 dark:bg-slate-600'}`
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
