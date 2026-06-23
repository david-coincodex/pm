'use client';

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';

interface SidebarCarouselShellProps {
  title: string;
  children: ReactNode[];
}

// Auto-advance interval.
const SLIDE_MS = 5000;

export default function SidebarCarouselShell({ title, children }: SidebarCarouselShellProps) {
  const count = children.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const startedAtRef = useRef(0);
  const remainingRef = useRef(SLIDE_MS);
  const scrollRef = useRef<HTMLDivElement>(null);

  const clear = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  // Schedule the next auto-advance `ms` from now (tracks elapsed for pause/resume).
  const run = useCallback((ms: number) => {
    clear();
    if (count <= 1) return;
    remainingRef.current = ms;
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      setDirection('next');
      setActiveIndex((prev) => (prev + 1) % count);
    }, ms);
  }, [count, clear]);

  // Start a fresh full cycle whenever the active slide changes (unless paused).
  useEffect(() => {
    remainingRef.current = SLIDE_MS;
    if (!pausedRef.current) run(SLIDE_MS);
    return clear;
  }, [activeIndex, run, clear]);

  // Sync mobile scroll when activeIndex changes. Scroll the container's scrollLeft only —
  // scrollIntoView also scrolls the page vertically, yanking the viewport up on auto-advance.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const child = el.children[activeIndex] as HTMLElement | undefined;
    if (!child) return;
    const target = el.scrollLeft + child.getBoundingClientRect().left - el.getBoundingClientRect().left;
    el.scrollTo({ left: target, behavior: 'smooth' });
  }, [activeIndex]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    clear();
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
  }, [clear]);

  const resume = useCallback(() => {
    pausedRef.current = false;
    run(remainingRef.current);
  }, [run]);

  // Jump to a specific slide; the slide-change effect restarts the timer.
  const goTo = (idx: number) => {
    if (idx === activeIndex) return;
    setDirection(idx >= activeIndex ? 'next' : 'prev');
    setActiveIndex(idx);
  };

  return (
    <aside
      className="flex flex-col gap-3"
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {title}
      </h2>

      {/* Desktop: one card at a time, animated */}
      <div className="hidden lg:block">
        <div
          key={activeIndex}
          className={`${direction === 'next' ? 'animate-bundle-in-right' : 'animate-bundle-in-left'} motion-reduce:animate-none`}
        >
          {children[activeIndex]}
        </div>
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

      {/* Progress bar */}
      {count > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {children.map((_, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={idx}
                aria-label={`Go to slide ${idx + 1}`}
                aria-current={isActive}
                onClick={() => goTo(idx)}
                className={`block h-1 rounded-full transition-all duration-300 ${
                  isActive
                    ? 'w-6 bg-emerald-500'
                    : 'w-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'
                }`}
              />
            );
          })}
        </div>
      )}
    </aside>
  );
}
