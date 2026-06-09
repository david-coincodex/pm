'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { routes } from '@/lib/routes';
import { useTranslations } from 'next-intl';
import type { Bundle } from '@/lib/strapi';
import { getDiscountPercent } from '@/lib/strapi';
import { strapiMediaUrl } from '@/lib/strapi';
import { themes, type SpotlightTheme } from '@/lib/themes';

const MAX_VISIBLE_SITES = 3;
// Auto-advance interval.
const SLIDE_MS = 4000;

interface BundleShowcaseProps {
  bundles: Bundle[];
  theme?: SpotlightTheme;
}

export default function BundleShowcase({ bundles, theme = 'amber' }: BundleShowcaseProps) {
  const t = useTranslations('bundles');
  const c = themes[theme];
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const startedAtRef = useRef(0);
  const remainingRef = useRef(SLIDE_MS);

  const clear = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  // Schedule the next auto-advance `ms` from now (tracks elapsed for pause/resume).
  const run = useCallback((ms: number) => {
    clear();
    if (bundles.length <= 1) return;
    remainingRef.current = ms;
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      setDirection('next');
      setActiveIndex((prev) => (prev + 1) % bundles.length);
    }, ms);
  }, [bundles.length, clear]);

  // Start a fresh full cycle whenever the active slide changes (unless paused).
  useEffect(() => {
    remainingRef.current = SLIDE_MS;
    if (!pausedRef.current) run(SLIDE_MS);
    return clear;
  }, [activeIndex, run, clear]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    clear();
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
  }, [clear]);

  const resume = useCallback(() => {
    pausedRef.current = false;
    run(remainingRef.current);
  }, [run]);

  // Jump to a specific bundle; the slide-change effect restarts the timer.
  const goTo = (idx: number) => {
    if (idx === activeIndex) return;
    setDirection(idx >= activeIndex ? 'next' : 'prev');
    setActiveIndex(idx);
  };

  if (bundles.length === 0) return null;

  const bundle = bundles[activeIndex];

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-14"
      onMouseEnter={pause}
      onMouseLeave={resume}
    >

      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-1 text-center">
          <span className={`mb-1 inline-block text-xs font-semibold uppercase tracking-widest ${c.eyebrow}`}>
            {t('eyebrow')}
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-2 text-base text-slate-300">{t('subtitle')}</p>
        </div>

        {/* Tab indicators */}
        {bundles.length > 1 && (
          <div className="mb-8 flex justify-center gap-2">
            {bundles.map((b, idx) => (
              <button
                key={b.id}
                type="button"
                onClick={() => goTo(idx)}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  idx === activeIndex
                    ? c.tabActive
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}

        {/* Active bundle */}
        <div
          key={bundle.id}
          className={`${direction === 'next' ? 'animate-bundle-in-right' : 'animate-bundle-in-left'} motion-reduce:animate-none`}
        >
          {bundle.description && (
            <p className="mb-6 text-center text-sm text-slate-400">{bundle.description}</p>
          )}

          {/* Bundle price from direct offers */}
          {(() => {
            const activeOffers = (bundle.offers ?? []).filter((o) => o.isActive);
            const best = activeOffers.length > 0
              ? [...activeOffers].sort((a, b) => a.price - b.price)[0]
              : null;
            const discount = best ? getDiscountPercent(best) : null;
            return best ? (
              <div className="mb-6 flex items-center justify-center gap-3">
                <span className={`text-2xl font-extrabold ${c.accentText}`}>
                  ${best.price.toFixed(2)}
                </span>
                {best.full_price && best.full_price > best.price && (
                  <span className="text-base text-slate-500 line-through">
                    ${best.full_price.toFixed(2)}
                  </span>
                )}
                {discount !== null && (
                  <span className={`rounded-full ${c.discountBadge} px-2.5 py-0.5 text-xs font-bold text-white`}>
                    {discount}%
                  </span>
                )}
              </div>
            ) : null;
          })()}

          {/* Site cards with + separators */}
          {(() => {
            const allSites = bundle.sites ?? [];
            const visibleSites = allSites.slice(0, MAX_VISIBLE_SITES);
            const remaining = allSites.length - MAX_VISIBLE_SITES;

            return (
              <div className="flex flex-wrap items-center justify-center gap-3 lg:gap-5">
                {visibleSites.map((site, idx) => {
                  const image = site.cover_image ?? site.logo;
                  return (
                    <div key={site.id} className="flex items-center gap-3 lg:gap-5">
                      {idx > 0 && (
                        <span className={`text-2xl font-bold lg:text-3xl ${c.accentMuted}`}>+</span>
                      )}
                      <Link
                        href={routes.site(site.slug)}
                        className={`group flex w-44 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm transition sm:w-56 lg:w-72 ${c.cardHover} hover:bg-white/10`}
                      >
                        <div className="relative aspect-video w-full overflow-hidden bg-slate-800">
                          {image ? (
                            <Image
                              src={strapiMediaUrl(image)}
                              alt={image.alternativeText ?? site.name}
                              width={image.width}
                              height={image.height}
                              className="h-full w-full object-cover opacity-80 transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-slate-600">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="p-3 lg:p-4">
                          <p className={`truncate text-sm font-semibold text-white transition-colors lg:text-base ${c.cardNameHover}`}>
                            {site.name}
                          </p>
                        </div>
                      </Link>
                    </div>
                  );
                })}
                {remaining > 0 && (
                  <div className="flex items-center gap-3 lg:gap-5">
                    <span className={`text-2xl font-bold lg:text-3xl ${c.accentMuted}`}>+</span>
                    <span className="text-sm font-semibold text-slate-300 lg:text-base">
                      {remaining} {t('sites')}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Progress bar + CTA */}
        <div className="mt-8 flex flex-col items-center gap-4">
          {bundles.length > 1 && (
            <div className="flex items-center gap-1.5">
              {bundles.map((b, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => goTo(idx)}
                    aria-label={b.name}
                    aria-current={isActive}
                    className={`block h-1.5 rounded-full transition-all duration-300 ${
                      isActive ? `w-8 ${c.progressBar}` : 'w-3 bg-white/20 hover:bg-white/40'
                    }`}
                  />
                );
              })}
            </div>
          )}
          <Link
            href={routes.bundles()}
            className={`inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 ${c.outlineButton}`}
          >
            {t('viewAll')}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
