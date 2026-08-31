'use client';

import { useState } from 'react';
import Lightbox from '@/components/Lightbox';

/**
 * The model page's photo strip — the feed's profile portrait plus our captured frames from
 * past sessions — with click-to-enlarge through the shared Lightbox.
 *
 * Sources arrive PRE-RESOLVED (Strapi media already through strapiMediaUrl, provider CDN
 * portraits as-is) — resolving here would double-prefix the media host.
 * data-cam-thumb keeps the broken-image fallback: a photo rotated away between render and
 * click fades out of the strip rather than showing a broken glyph.
 */
export default function CamModelPhotos({ photos, alt }: { photos: { key: string; src: string }[]; alt: string }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {photos.map((p, i) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setLightboxIndex(i)}
            /* :has() — when the broken-image handler marks the img, the BUTTON disappears too;
               hiding only the img would leave an invisible click target opening a dead image. */
            className="overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 [&:has([data-broken])]:hidden"
            aria-label={`${alt} — ${i + 1}/${photos.length}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.src}
              alt={alt}
              loading="lazy"
              decoding="async"
              data-cam-thumb=""
              className="h-28 w-40 border border-slate-200 object-cover transition-transform duration-300 hover:scale-105 data-[broken]:hidden dark:border-slate-700 rounded-xl"
            />
          </button>
        ))}
      </div>

      <Lightbox
        items={photos.map((p) => ({ id: p.key, src: p.src, alt }))}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}
