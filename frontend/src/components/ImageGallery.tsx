'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { strapiMediaUrl, type StrapiMedia } from '@/lib/strapi';
import { strapiImgSources } from '@/lib/strapiImage';
import { requestPlay, release, autoplayAllowed } from '@/lib/clipPlayback';

/**
 * A gallery item. Structurally satisfied by `StrapiMedia`, but deliberately looser so the
 * `media-gallery` rich-text widget can feed items parsed from article HTML (which carry a
 * `mime` and no `documentId`). Anything with a video mime or extension renders as a silent
 * autoplaying clip, same behaviour as the commercial players.
 */
export type GalleryItem = Pick<StrapiMedia, 'url'> & {
  id: number | string;
  alternativeText?: string | null;
  mime?: string;
  /** Strapi's pre-generated resizes; grid cells prefer these over the original. */
  formats?: StrapiMedia['formats'];
  /** Original pixel width, when known — used as the srcset descriptor for the original file. */
  width?: number;
};

interface ImageGalleryProps {
  images: GalleryItem[];
  coverImage?: StrapiMedia | null;
  className?: string;
  /**
   * Mark the first (largest) grid image as the page's LCP candidate: eager-loaded with
   * fetchpriority=high and preloaded from the initial HTML. Set this ONLY where the gallery is
   * above the fold (the site details hero) — a priority image below the fold steals bandwidth
   * from the real LCP element.
   */
  priorityFirst?: boolean;
}

/**
 * Responsive sources for a grid cell, built from Strapi's pre-generated resizes.
 *
 * `url` is the ORIGINAL upload (measured: 670px, ~45 KiB where a mobile cell needs ~5 KiB), but a
 * single fixed format cannot serve both viewports either — measured cells are ~384px wide on
 * desktop and ~175px on mobile, so `thumbnail` (245w) is right for one and ×1.57-soft on the
 * other. With the image optimizer off (`images.unoptimized`), next/image emits no srcset, so the
 * grid uses a plain <img> with a hand-built one: thumbnail/small/medium/large plus the original,
 * and the browser picks per viewport and DPR.
 *
 * The large row-span-2 cell crops landscape sources to a portrait box, so width-based selection
 * would undershoot its height; its `sizes` is the crop-equivalent width (displayed height x
 * source aspect), which biases the pick tall enough. The lightbox keeps the original. Items fed
 * by the rich-text media-gallery widget carry no `formats` and degrade to a bare src.
 */
function gridImgProps(img: GalleryItem, index: number, total: number) {
  const { src, srcSet } = strapiImgSources(img);
  if (!srcSet) return { src };

  const isLarge = total === 1 || index === 0;
  const sizes = total === 1
    ? '(max-width: 768px) 92vw, 740px'
    : isLarge
      ? '(max-width: 768px) 90vw, 750px' // crop-equivalent width of the tall cell
      : '(max-width: 768px) 45vw, 400px';
  return { src, srcSet, sizes };
}

const isVideo = (item: GalleryItem) =>
  item.mime?.startsWith('video/') || /\.(mp4|webm|mov)(\?|$)/i.test(item.url);

// The cols-2/rows-2 template holds at most 3 tiles once the first spans both rows, so these are
// the only patterns; galleries with more images show "+N" on the last tile.
const GRID_CLASSES = [
  // 1 image
  ['col-span-2 row-span-2'],
  // 2 images
  ['col-span-1 row-span-2', 'col-span-1 row-span-2'],
  // 3+ images
  ['col-span-1 row-span-2', 'col-span-1 row-span-1', 'col-span-1 row-span-1'],
];

function getGridClasses(total: number, index: number): string {
  const pattern = GRID_CLASSES[Math.min(total, 3) - 1];
  return pattern[Math.min(index, pattern.length - 1)];
}

/**
 * A silent looping clip in a grid cell — the commercial-page behaviour: `src` stays in
 * `data-src` so an untouched page transfers zero video bytes, playback starts on
 * scroll-into-view through the shared concurrency cap (2 at once, decoder limits), and
 * leaving the viewport releases the source. Respects reduced-motion / data-saver.
 */
function VideoCell({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!autoplayAllowed()) {
      // Reduced-motion / data-saver: no autoplay, and these clips carry no poster — without
      // this the cell renders as an empty black box. Load just the first frame instead.
      if (el.dataset.src && !el.getAttribute('src')) {
        el.src = el.dataset.src;
        el.preload = 'metadata';
      }
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) requestPlay(el);
        else release(el, true);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      release(el, true);
    };
  }, [src]);

  return (
    <video
      ref={ref}
      data-src={src}
      muted
      loop
      playsInline
      preload="none"
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
    />
  );
}

export default function ImageGallery({ images: galleryImages, coverImage, className = '', priorityFirst = false }: ImageGalleryProps) {
  const t = useTranslations('gallery');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Fall back to the cover image when the gallery has no images.
  const images: GalleryItem[] = galleryImages.length > 0 ? galleryImages : coverImage ? [coverImage] : [];

  // Three tiles maximum. The grid template is cols-2/rows-2 and the first tile spans both rows,
  // leaving exactly two single slots — tiles 4 and 5 used to overflow into implicit zero-height
  // rows: invisible, yet their images still downloaded, and the "+N" chip sat on a hidden cell
  // (measured: 384x0). The lightbox still pages through the full set.
  const displayed = images.slice(0, 3);
  const hasMore = images.length > 3;

  const close = useCallback(() => setLightboxIndex(null), []);
  const prev = useCallback(() =>
    setLightboxIndex((i) => (i !== null ? (i - 1 + images.length) % images.length : null)),
    [images.length]);
  const next = useCallback(() =>
    setLightboxIndex((i) => (i !== null ? (i + 1) % images.length : null)),
    [images.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, prev, next, close]);

  if (images.length === 0) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 gap-2 ${className}`} style={{ aspectRatio: '16/9' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`relative overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center ${i === 0 ? 'col-span-1 row-span-2' : 'col-span-1 row-span-1'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        ))}
      </div>
    );
  }

  const current = lightboxIndex !== null ? images[lightboxIndex] : null;

  return (
    <>
      {/* Grid */}
      <div className={`grid grid-cols-2 grid-rows-2 gap-2 ${className}`} style={{ aspectRatio: '16/9' }}>
        {displayed.map((img, i) => (
          <button
            key={img.id}
            className={`relative overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${getGridClasses(displayed.length, i)}`}
            onClick={() => setLightboxIndex(i)}
            aria-label={img.alternativeText ?? `Image ${i + 1}`}
          >
            {isVideo(img) ? (
              <VideoCell src={strapiMediaUrl(img)} />
            ) : (
              // Plain <img>, not next/image: with the optimizer off, next/image emits a single
              // fixed src and no srcset, so it cannot serve both the 384px desktop cells and the
              // 175px mobile cells. The hand-built srcset from Strapi's formats can. The first
              // cell is the LCP element on pages that opt in: eager + fetchpriority=high, and
              // being in the initial HTML it is discoverable without a preload link.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                {...gridImgProps(img, i, displayed.length)}
                alt={img.alternativeText ?? ''}
                loading={priorityFirst && i === 0 ? 'eager' : 'lazy'}
                fetchPriority={priorityFirst && i === 0 ? 'high' : undefined}
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              />
            )}
            {hasMore && i === displayed.length - 1 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="text-xl font-bold text-white">+{images.length - displayed.length}</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && current && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={close}
        >
          {/* Close */}
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            onClick={close}
            aria-label={t('close')}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Prev */}
          {images.length > 1 && (
            <button
              className="absolute left-4 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); prev(); }}
              aria-label={t('prev')}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Media + counter */}
          <div
            className="flex flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {isVideo(current) ? (
              // Controls in the lightbox — the grid autoplays silently, but opening a clip is
              // explicit intent, so give the visitor scrubbing and sound.
              <video
                src={strapiMediaUrl(current)}
                controls
                autoPlay
                muted
                playsInline
                className="max-h-[80vh] max-w-[90vw] rounded-xl"
              />
            ) : (
              <div className="relative max-h-[90vh] max-w-[90vw] min-w-[50vw] min-h-[50vh]">
                <Image
                  src={strapiMediaUrl(current)}
                  alt={current.alternativeText ?? ''}
                  fill
                  className="object-contain rounded-xl"
                  sizes="90vw"
                />
              </div>
            )}
            <p className="text-center text-sm text-white/60">
              {t('imageOf', { current: lightboxIndex + 1, total: images.length })}
            </p>
          </div>

          {/* Next */}
          {images.length > 1 && (
            <button
              className="absolute right-4 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); next(); }}
              aria-label={t('next')}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      )}
    </>
  );
}
