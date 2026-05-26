'use client';

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';

interface SidebarCarouselShellProps {
  title: string;
  children: ReactNode[];
}

export default function SidebarCarouselShell({ title, children }: SidebarCarouselShellProps) {
  const count = children.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!pausedRef.current) {
        setActiveIndex((prev) => (prev + 1) % count);
      }
    }, 5000);
  }, [count]);

  useEffect(() => {
    if (count <= 1) return;
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [count, startTimer]);

  // Sync mobile scroll when activeIndex changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const child = el.children[activeIndex] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }, [activeIndex]);

  return (
    <aside
      className="flex flex-col gap-3"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {title}
      </h2>

      {/* Desktop: one card at a time */}
      <div className="hidden lg:block">
        {children.map((child, i) => (
          <div key={i} className={i === activeIndex ? 'block' : 'hidden'}>
            {child}
          </div>
        ))}
      </div>

      {/* Mobile: horizontal snap-scroll */}
      <div
        ref={scrollRef}
        className="flex lg:hidden snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children.map((child, i) => (
          <div key={i} className="snap-start shrink-0 w-72">
            {child}
          </div>
        ))}
      </div>

      {/* Progress dots (desktop) */}
      {count > 1 && (
        <div className="hidden lg:flex items-center justify-center gap-1.5">
          {children.map((_, idx) => (
            <button
              key={idx}
              aria-label={`Go to slide ${idx + 1}`}
              onClick={() => { setActiveIndex(idx); startTimer(); }}
              className={`block h-1 rounded-full transition-all duration-300 ${
                idx === activeIndex
                  ? 'w-6 bg-emerald-500'
                  : 'w-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'
              }`}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
