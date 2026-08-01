'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import OfferLink from '@/components/offer/OfferLink';
import type { OfferInfo } from '@/components/offer/types';
import {
  requestPlay,
  release,
  autoplayAllowed,
  isHoverCapable,
} from '@/lib/clipPlayback';

interface CommercialPlayerProps {
  clipUrl: string;
  /** Accessible label — the ad's title. */
  label: string;
  /**
   * `hover`  — index thumbnails: play while the pointer is over it (desktop only).
   * `inview` — detail blocks: play while ≥50% visible.
   */
  mode: 'hover' | 'inview';
  /** Rendered underneath as the still; stays visible until the clip actually paints. */
  children: React.ReactNode;
  className?: string;
  /**
   * Conversion CTA overlaid on the clip a few seconds into playback (detail blocks only —
   * an 80px index thumbnail has no room for it). Routed through OfferLink so it behaves
   * exactly like a "Buy Now" click: same /offer/<id>/ redirect, same offer popup.
   */
  promo?: { offer: OfferInfo; label: string };
}

/**
 * Progressive-enhancement video layer.
 *
 * The still (a real, lazily-loaded `next/image` passed as `children`) is server-rendered and
 * is what search engines and no-JS visitors see; this component only adds playback on top.
 * Deliberately:
 *  - no `src` in the initial HTML — it lives in `data-src` until intent is proven, so an
 *    untouched page transfers zero video bytes
 *  - no `poster` attribute — it can't be lazy-loaded or `sizes`-narrowed, and would
 *    double-fetch alongside the `next/image` still
 *  - no `preload="metadata"` — that would be ~20 connections on load
 */
/**
 * How long a clip must play before the CTA appears. Short on purpose: these clips run
 * ~15s, so waiting longer means most viewers scroll past before it ever shows.
 */
const PROMO_DELAY_MS = 800;

export default function CommercialPlayer({
  clipUrl,
  label,
  mode,
  children,
  className = '',
  promo,
}: CommercialPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const promoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Resolved in an effect, never during render: reading matchMedia while rendering
  // produces a hydration mismatch.
  const [canAuto, setCanAuto] = useState(false);
  const [canHover, setCanHover] = useState(false);

  const clearPromo = useCallback(() => {
    if (promoTimer.current) {
      clearTimeout(promoTimer.current);
      promoTimer.current = null;
    }
    setShowPromo(false);
  }, []);

  // Clean up the pending timer on unmount so it can't fire into a dead component.
  useEffect(() => clearPromo, [clearPromo]);

  useEffect(() => {
    const sync = () => {
      setCanAuto(autoplayAllowed());
      setCanHover(isHoverCapable());
    };
    sync();
    const queries = [
      window.matchMedia('(prefers-reduced-motion: reduce)'),
      window.matchMedia('(hover: hover) and (pointer: fine)'),
    ];
    queries.forEach((q) => q.addEventListener('change', sync));
    return () => queries.forEach((q) => q.removeEventListener('change', sync));
  }, []);

  // Detail blocks play while in view. Index thumbnails are hover-driven instead, so they
  // never observe.
  useEffect(() => {
    const el = ref.current;
    if (!el || mode !== 'inview' || !canAuto) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) requestPlay(el);
        else {
          release(el, true); // hard: out of view, free the decoder and buffer
          setLive(false);
          clearPromo();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      release(el, true);
    };
  }, [mode, canAuto, clearPromo]);

  const hoverHandlers =
    mode === 'hover' && canHover && canAuto
      ? {
          onPointerEnter: () => requestPlay(ref.current),
          onPointerLeave: () => {
            release(ref.current); // soft: replay from HTTP cache on re-hover
            setLive(false);
            clearPromo();
          },
        }
      : {};

  // Detail blocks are click-to-toggle as well. This is the ONLY way to play for visitors
  // with prefers-reduced-motion or saveData (autoplay is disabled for them by design), and
  // a handy pause for everyone else. Not on index thumbnails — those live inside an <a>,
  // where a click must stay a navigation.
  const clickHandlers =
    mode === 'inview'
      ? {
          onClick: () => {
            const el = ref.current;
            if (!el) return;
            if (el.paused) requestPlay(el);
            else {
              release(el);
              setLive(false);
              clearPromo();
            }
          },
        }
      : {};

  return (
    <>
      {children}
      <video
        ref={ref}
        data-src={clipUrl}
        preload="none"
        loop
        muted
        playsInline
        disablePictureInPicture
        aria-label={label}
        tabIndex={-1}
        onPlaying={() => {
          setLive(true);
          // A few seconds in: the viewer has engaged with the clip, so the CTA has earned
          // its place. Only for the detail player — see the `promo` prop.
          if (promo && mode === 'inview' && !promoTimer.current) {
            promoTimer.current = setTimeout(() => setShowPromo(true), PROMO_DELAY_MS);
          }
        }}
        onPause={clearPromo}
        {...hoverHandlers}
        {...clickHandlers}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 motion-reduce:transition-none ${
          live ? 'opacity-100' : 'opacity-0'
        } ${mode === 'inview' ? 'cursor-pointer' : ''} ${className}`}
      />

      {promo && mode === 'inview' && (
        <div
          // `inert` (not just aria-hidden): an opacity-0 link is otherwise still keyboard
          // focusable, so a tab stop would land on an invisible CTA.
          inert={!showPromo}
          className={`pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4 transition duration-300 ease-out motion-reduce:translate-y-0 motion-reduce:transition-none ${
            showPromo ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
          aria-hidden={!showPromo}
        >
          <OfferLink
            offer={promo.offer}
            className={`pointer-events-auto rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white no-underline shadow-lg transition hover:bg-emerald-700 active:scale-95 dark:bg-emerald-500 dark:hover:bg-emerald-600 ${
              showPromo ? '' : 'pointer-events-none'
            }`}
          >
            {promo.label}
          </OfferLink>
        </div>
      )}
    </>
  );
}
