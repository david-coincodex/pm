'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { type StrapiMedia } from '@/lib/strapi';

interface ImageGalleryProps {
  images: StrapiMedia[];
  className?: string;
}

const GRID_CLASSES = [
  // 1 image
  ['col-span-2 row-span-2'],
  // 2 images
  ['col-span-1 row-span-2', 'col-span-1 row-span-2'],
  // 3 images
  ['col-span-1 row-span-2', 'col-span-1 row-span-1', 'col-span-1 row-span-1'],
  // 4 images
  ['col-span-1 row-span-2', 'col-span-1 row-span-1', 'col-span-1 row-span-1', 'col-span-1 row-span-1'],
  // 5+ images (first image large, rest fill)
  ['col-span-1 row-span-2', 'col-span-1 row-span-1', 'col-span-1 row-span-1', 'col-span-1 row-span-1', 'col-span-1 row-span-1'],
];

function getGridClasses(total: number, index: number): string {
  const pattern = GRID_CLASSES[Math.min(total, 5) - 1];
  return pattern[Math.min(index, pattern.length - 1)];
}

export default function ImageGallery({ images, className = '' }: ImageGalleryProps) {
  const t = useTranslations('gallery');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const displayed = images.slice(0, 5);
  const hasMore = images.length > 5;

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

  if (images.length === 0) return null;

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
            <Image
              src={img.url.startsWith('http') ? img.url : `${process.env.NEXT_PUBLIC_STRAPI_URL ?? ''}${img.url}`}
              alt={img.alternativeText ?? ''}
              fill
              className="object-cover transition-transform duration-300 hover:scale-105"
              sizes="(max-width: 768px) 50vw, 33vw"
            />
            {hasMore && i === 4 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="text-xl font-bold text-white">+{images.length - 5}</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
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

          {/* Image + counter */}
          <div
            className="flex flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative max-h-[90vh] max-w-[90vw] min-w-[50vw] min-h-[50vh]">
              <Image
                src={
                  images[lightboxIndex].url.startsWith('http')
                    ? images[lightboxIndex].url
                    : `${process.env.NEXT_PUBLIC_STRAPI_URL ?? ''}${images[lightboxIndex].url}`
                }
                alt={images[lightboxIndex].alternativeText ?? ''}
                fill
                className="object-contain rounded-xl"
                sizes="90vw"
              />
            </div>
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
