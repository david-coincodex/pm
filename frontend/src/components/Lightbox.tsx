'use client';

import { useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';

/**
 * One item the lightbox can enlarge. `src` must arrive PRE-RESOLVED: callers own their URL
 * scheme (ImageGallery runs Strapi media through strapiMediaUrl; the cam photo strip passes
 * provider-CDN URLs as-is, and resolves Strapi media itself — double-resolving through
 * strapiMediaUrl would wrongly prefix the media host).
 */
export type LightboxItem = {
  id: string | number;
  src: string;
  alt?: string;
  video?: boolean;
};

interface LightboxProps {
  items: LightboxItem[];
  /** Which item is open, or null when closed. Controlled by the parent gallery. */
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

/**
 * THE lightbox — extracted from ImageGallery so every gallery on the site (site media grids,
 * the cam model photo strip, whatever comes next) opens images the same way: dimmed backdrop,
 * close/prev/next, arrow-key + Escape handling, mobile bottom bar with a counter.
 *
 * Enlarged images render as plain <img>, not next/image: sources come from arbitrary hosts
 * (Strapi media, provider CDNs), the optimizer is globally off anyway,
 * and this keeps the component free of remotePatterns coupling.
 */
export default function Lightbox({ items, index, onClose, onIndexChange }: LightboxProps) {
  const t = useTranslations('gallery');

  const prev = useCallback(() => {
    if (index !== null) onIndexChange((index - 1 + items.length) % items.length);
  }, [index, items.length, onIndexChange]);
  const next = useCallback(() => {
    if (index !== null) onIndexChange((index + 1) % items.length);
  }, [index, items.length, onIndexChange]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // A modal owns the viewport: the page behind must not scroll while it is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [index, prev, next, onClose]);

  const current = index !== null ? items[index] : null;
  if (index === null || !current) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      {/* Close */}
      <button
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        onClick={onClose}
        aria-label={t('close')}
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Prev — desktop only; mobile navigation lives in the bottom bar so the side
          arrows never eat into the (now full-width) image. */}
      {items.length > 1 && (
        <button
          className="absolute left-4 hidden rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 md:block"
          onClick={(e) => { e.stopPropagation(); prev(); }}
          aria-label={t('prev')}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Media + controls. No stopPropagation on the wrapper: its padding/min-size regions
          LOOK like backdrop (pure black), so clicks there must close like backdrop clicks.
          Only the media elements and the control bar swallow clicks. */}
      <div className="flex w-full flex-col items-center gap-3 md:w-auto md:gap-2">
        {current.video ? (
          // Controls in the lightbox — grids autoplay silently, but opening a clip is
          // explicit intent, so give the visitor scrubbing and sound.
          <video
            src={current.src}
            controls
            autoPlay
            muted
            playsInline
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full md:w-auto md:max-w-[90vw] md:rounded-xl"
          />
        ) : (
          // Mobile: the full viewport width — the image is the point of the lightbox.
          // Desktop keeps the contained, rounded presentation.
          <div className="relative flex h-[70vh] w-full items-center justify-center md:h-auto md:max-h-[90vh] md:w-auto md:min-h-[50vh] md:min-w-[50vw] md:max-w-[90vw]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.src}
              alt={current.alt ?? ''}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full object-contain md:max-h-[90vh] md:rounded-xl"
            />
          </div>
        )}

        {/* Mobile: prev / counter / next in one bottom bar */}
        <div className="flex items-center gap-8 md:hidden" onClick={(e) => e.stopPropagation()}>
          {items.length > 1 && (
            <button
              className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); prev(); }}
              aria-label={t('prev')}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <p className="text-center text-sm text-white/60">{t('imageOf', { current: index + 1, total: items.length })}</p>
          {items.length > 1 && (
            <button
              className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); next(); }}
              aria-label={t('next')}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        <p className="hidden text-center text-sm text-white/60 md:block">
          {t('imageOf', { current: index + 1, total: items.length })}
        </p>
      </div>

      {/* Next — desktop only (see prev) */}
      {items.length > 1 && (
        <button
          className="absolute right-4 hidden rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 md:block"
          onClick={(e) => { e.stopPropagation(); next(); }}
          aria-label={t('next')}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
