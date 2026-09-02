'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getMobileCols, getServerMobileCols, subscribeCols } from '@/lib/cams/gridCols';
import { VIDEO_PLUGINS } from '@/lib/cams/providers/video';
import type { CamModel } from '@/lib/cams/types';

interface Props {
  model: CamModel;
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

/**
 * Live-video preview inside a model card, replacing the old hover-zoom.
 *
 * Desktop (hover-capable pointers): the stream starts on hover — after a small delay so
 * mousing across the grid doesn't open connections — and stops on leave.
 * Mobile (no hover): the card most centered in the viewport autoplays, one at a time,
 * arbitrated by the focus manager above. Skipped entirely for visitors with
 * prefers-reduced-motion or Data Saver on.
 *
 * The PICTURE comes from the provider's video plugin (lib/cams/providers/video.ts); everything
 * above — intent, arbitration, opt-outs, the loading sweep, failure handling — lives here and
 * is therefore identical for every provider, present and future. Only one preview is ever
 * active at a time (hover intent / mobile single-active), so at most one surface is live.
 *
 * Renders null server-side; the static thumbnail stays underneath as backdrop and fallback.
 */
export default function CamCardPreview({ model }: Props) {
  const plugin = VIDEO_PLUGINS[model.provider];
  const Preview = plugin.Preview;
  // Nothing to preview → the card keeps its static thumbnail and we never arm any listener.
  const previewable = Boolean(Preview) && plugin.canPlay(model);
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
    if (!holder || !previewable) return;
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
  }, [previewable, activate, mobileCols]);

  return (
    <div ref={holderRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
      {/* Loading sweep along the card's very top edge while the live surface spins up. */}
      {active && !failed && !ready && (
        <div className="absolute inset-x-0 top-0 z-10 h-1 overflow-hidden">
          <div className="h-full w-1/3 animate-cam-load bg-emerald-500 shadow-[0_0_6px_theme(colors.emerald.400)]" />
        </div>
      )}
      {active && !failed && Preview && (
        <Preview model={model} onReady={onReady} onFatal={onFatal} />
      )}
    </div>
  );
}
