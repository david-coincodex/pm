'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type Hls from 'hls.js';
import { getMobileCols, getServerMobileCols, subscribeCols } from '@/lib/cams/gridCols';

interface Props {
  /** Raw HLS live stream (BongaCams) — played muted in our <video>: its feed hands out a plain
   * public m3u8. */
  streamUrl?: string;
  /** Chaturbate's embed_video_only iframe URL (same one the model page uses). CB's stream isn't
   * resolvable server-side (see memory cb-stream-token-ip-bound), so its preview reuses the
   * provider's own player — no chat, muted via disable_sound=1 in the URL, and the holder is
   * pointer-events-none so it can't be interacted with (stays a silent, click-through preview).
   * If both are set, streamUrl wins; in practice a model has exactly one. */
  embedUrl?: string;
}

/** Hover must be intent, not a drive-by on the way to another card. */
const ENTER_DELAY_MS = 250;
/** Mobile: wait for scrolling to settle before switching the playing card. */
const FOCUS_DEBOUNCE_MS = 400;
/** Mobile: a card must fill this much of the center band before it plays. */
const MIN_FOCUS_RATIO = 0.35;

/* ── Mobile focus manager ─────────────────────────────────────────────────────
 * One playing card per screen, chosen by who is most visible in the middle 40%
 * of the viewport. A module-level singleton because the cards must agree: two
 * side-by-side cards in a 2-column grid both qualify, and without a referee
 * they would both start streaming. */
type Entry = { ratio: number; setActive: (v: boolean) => void };
const entries = new Map<Element, Entry>();
let observer: IntersectionObserver | null = null;
let activeCard: Element | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

function evaluate() {
  let bestEl: Element | null = null;
  let bestRatio = MIN_FOCUS_RATIO;
  entries.forEach((entry, el) => {
    if (entry.ratio > bestRatio) {
      bestRatio = entry.ratio;
      bestEl = el;
    }
  });
  if (bestEl === activeCard) return;
  if (activeCard) entries.get(activeCard)?.setActive(false);
  activeCard = bestEl;
  if (activeCard) entries.get(activeCard)?.setActive(true);
}

function schedule() {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(evaluate, FOCUS_DEBOUNCE_MS);
}

function registerFocusCandidate(el: Element, setActive: (v: boolean) => void): () => void {
  observer ??= new IntersectionObserver(
    (records) => {
      for (const r of records) {
        const entry = entries.get(r.target);
        if (entry) entry.ratio = r.isIntersecting ? r.intersectionRatio : 0;
      }
      schedule();
    },
    // The center band: cards in the top/bottom 30% of the viewport never play.
    { rootMargin: '-30% 0px -30% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
  entries.set(el, { ratio: 0, setActive });
  observer.observe(el);
  return () => {
    observer?.unobserve(el);
    entries.delete(el);
    if (activeCard === el) activeCard = null;
    schedule();
  };
}

/** Minimal muted HLS playback for a card — no controls, lowest sensible quality. */
function PreviewVideo({ src, onFatal, onReady }: { src: string; onFatal: () => void; onReady: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | null = null;
    let cancelled = false;
    video.muted = true;
    const play = () => void video.play().catch(() => {});
    // 'playing' = frames are actually rendering — the loading bar's finish line.
    video.addEventListener('playing', onReady, { once: true });

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('error', onFatal);
      play();
    } else {
      void import('hls.js').then(({ default: HlsCtor }) => {
        if (cancelled) return;
        if (!HlsCtor.isSupported()) return onFatal();
        hls = new HlsCtor({
          liveSyncDurationCount: 3,
          maxBufferLength: 6,
          // A card is ~300px wide: cap the level to the element so previews stream 240p,
          // not the 720p a full player would pick.
          capLevelToPlayerSize: true,
          startLevel: 0,
        });
        hls.on(HlsCtor.Events.ERROR, (_e, data) => {
          if (data.fatal) onFatal(); // previews are disposable — no recovery dance, just vanish
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(HlsCtor.Events.MANIFEST_PARSED, play);
      });
    }

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeEventListener('error', onFatal);
      video.removeEventListener('playing', onReady);
      video.removeAttribute('src');
      video.load();
    };
  }, [src, onFatal, onReady]);

  return <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />;
}

/**
 * Live-video preview inside a model card, replacing the old hover-zoom.
 *
 * Desktop (hover-capable pointers): the stream starts on hover — after a small delay so
 * mousing across the grid doesn't open connections — and stops on leave.
 * Mobile (no hover): the card most centered in the viewport autoplays, one at a time,
 * arbitrated by the focus manager above. Skipped entirely for visitors with
 * prefers-reduced-motion or Data Saver on.
 *
 * Sources: BongaCams cards play their feed's raw HLS in a muted <video>; Chaturbate cards mount
 * the provider's embed_video_only iframe (same player as the model page) — it can't be muted
 * programmatically, but disable_sound=1 starts it silent and the pointer-events-none holder
 * keeps it non-interactive. Only one preview is ever active at a time (hover intent / mobile
 * single-active), so at most one iframe is live.
 *
 * Renders null server-side; the static thumbnail stays underneath as backdrop and fallback.
 */
export default function CamCardPreview({ streamUrl, embedUrl }: Props) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  // Mobile center-focus autoplay is opt-in: only when the visitor browses 1-per-row (one big
  // card fills the screen). At 2-per-row, auto-playing a stream is noise — hover/tap only.
  const mobileCols = useSyncExternalStore(subscribeCols, getMobileCols, getServerMobileCols);
  const [failed, setFailed] = useState(false);
  // True once the preview surface reports frames (HLS 'playing' / iframe 'load') — until
  // then the loading bar sweeps. Keyed to `active` so every fresh hover starts a fresh bar.
  const [ready, setReady] = useState(false);

  const onFatal = useCallback(() => {
    setFailed(true);
    setActive(false);
  }, []);
  const onReady = useCallback(() => setReady(true), []);
  const activate = useCallback((v: boolean) => {
    setReady(false);
    if (v) setFailed(false); // a fresh activation retries — failure must not be sticky across hovers
    setActive(v);
  }, []);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || (!streamUrl && !embedUrl)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;
    // The stretched link paints above this layer, so hover must be observed on the card root.
    const card = holder.closest('[data-cam-card]');
    if (!card) return;

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const enter = () => {
        timer = setTimeout(() => activate(true), ENTER_DELAY_MS);
      };
      const leave = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        activate(false);
      };
      card.addEventListener('mouseenter', enter);
      card.addEventListener('mouseleave', leave);
      return () => {
        card.removeEventListener('mouseenter', enter);
        card.removeEventListener('mouseleave', leave);
        if (timer) clearTimeout(timer);
      };
    }

    // Mobile center-focus autoplay only when the grid ACTUALLY shows one card per row:
    // an explicit "1", or the default (0) on a phone (<sm, where auto = 1 col). At 2-per-row
    // (explicit, or default on a tablet) it's noise, so skip.
    const oneColumn = mobileCols === 1 || (mobileCols === 0 && window.matchMedia('(max-width: 639px)').matches);
    if (!oneColumn) return;
    // Arm the focus manager only after the visitor actually interacts. Auto-playing
    // the centered card before ANY interaction meant every mobile pageload pulled a full
    // provider embed (~2MB JS + live video) — measured tanking Lighthouse (which never
    // interacts) and real first-visit data budgets alike. Humans scroll within moments, so
    // the ambient-preview feature is intact; it just waits for proof of a human.
    let cleanupFocus: (() => void) | null = null;
    const arm = () => {
      cleanupFocus ??= registerFocusCandidate(card, activate);
    };
    const armEvents: (keyof WindowEventMap)[] = ['scroll', 'touchstart', 'pointerdown'];
    armEvents.forEach((e) => window.addEventListener(e, arm, { once: true, passive: true }));
    return () => {
      armEvents.forEach((e) => window.removeEventListener(e, arm));
      cleanupFocus?.();
    };
  }, [streamUrl, embedUrl, activate, mobileCols]);

  return (
    <div ref={holderRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
      {/* Loading sweep along the card's very top edge while the live surface spins up. */}
      {active && !failed && !ready && (
        <div className="absolute inset-x-0 top-0 z-10 h-1 overflow-hidden">
          <div className="h-full w-1/3 animate-cam-load bg-emerald-500 shadow-[0_0_6px_theme(colors.emerald.400)]" />
        </div>
      )}
      {active && !failed && (
        streamUrl ? (
          <PreviewVideo src={streamUrl} onFatal={onFatal} onReady={onReady} />
        ) : embedUrl ? (
          /* Chaturbate's own player, same embed as the model page — no chat, muted start. The
             holder is pointer-events-none, so clicks fall through to the card's navigation link
             and the visitor can't unmute a preview.
             The 16:9 stream is LETTERBOXED (full-width, centered on black) inside the 4:3 card
             instead of filling it: an iframe can't be object-fit, so filling would make the CB
             player crop the frame — the "zoomed in" look. Bars show the whole scene instead. */
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <iframe
              src={embedUrl}
              title=""
              aria-hidden="true"
              tabIndex={-1}
              scrolling="no"
              allow="autoplay"
              className="aspect-video w-full border-0"
              onLoad={onReady}
            />
          </div>
        ) : null
      )}
    </div>
  );
}
