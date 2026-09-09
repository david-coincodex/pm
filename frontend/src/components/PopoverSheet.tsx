'use client';

import { useState, useRef, useEffect, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';

interface PopoverSheetProps {
  /** Trigger element. Pass a render function to receive the `open` state (e.g. for chevron rotation). */
  trigger?: ReactNode | ((open: boolean) => ReactNode);
  /** Optional heading shown in the sheet/popup header */
  title?: string;
  children: ReactNode;
  /** Controlled open state — when provided, the sheet is controlled externally */
  forceOpen?: boolean;
  /** Called when the sheet requests to close (controlled mode) */
  onClose?: () => void;
}

/**
 * Enter/exit timings, in ONE place: the CSS transition and the unmount timeout below are both
 * driven from these, so the panel can never be removed mid-animation (or linger after it).
 *
 * Opening is 180ms and closing 140ms — dismissals should feel instant, appearances can afford a
 * beat. Both were 200ms+, which measured as ~240ms of visible movement and read as sluggish.
 */
const ENTER_MS = 180;
const EXIT_MS = 140;

const subscribeNever = () => () => {};

export default function PopoverSheet({ trigger, title, children, forceOpen, onClose }: PopoverSheetProps) {
  const t = useTranslations('nav');
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = forceOpen !== undefined;
  const open = isControlled ? forceOpen : internalOpen;
  const wrapRef = useRef<HTMLDivElement>(null);
  // "Am I hydrated?" via the store hook (same pattern as NavMenu): the server snapshot says
  // no, the client re-reads once after hydration — no effect-driven setState.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  /**
   * Two-flag animation state: `render` keeps the portal mounted through the exit animation,
   * `show` drives the CSS transition. The SYNCHRONOUS halves — mount immediately on open,
   * start the exit immediately on close — are render-phase adjustments (React's documented
   * pattern for state derived from a changing value), so neither is a setState inside an
   * effect body. The effect keeps only the genuinely async halves: the double-rAF that lets
   * the hidden state paint before transitioning in, and the delayed unmount after the exit.
   */
  const [render, setRender] = useState(open);
  const [show, setShow] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setRender(true);
    else setShow(false);
  }

  useEffect(() => {
    if (open) {
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setShow(true)); });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }
    const id = setTimeout(() => setRender(false), EXIT_MS);
    return () => clearTimeout(id);
  }, [open]);

  const close = useCallback(() => {
    if (isControlled) {
      onClose?.();
    } else {
      setInternalOpen(false);
    }
  }, [isControlled, onClose]);

  function toggle() {
    if (isControlled) return;
    setInternalOpen((v) => !v);
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Prevent body scroll while open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const triggerNode = trigger
    ? (typeof trigger === 'function' ? trigger(open) : trigger)
    : null;

  const duration = { transitionDuration: `${show ? ENTER_MS : EXIT_MS}ms` };

  return (
    <div ref={wrapRef} className={triggerNode ? 'relative inline-block' : ''}>
      {triggerNode && <div className="h-full" onClick={toggle}>{triggerNode}</div>}

      {render && mounted && createPortal(
        <>
          {/* Overlay — visual only; the dialog wrapper below covers the viewport and owns the
              click-to-close. Same duration/easing as the panel so they read as one object. */}
          <div
            style={duration}
            className={`fixed inset-0 z-[80] bg-black/50 transition-opacity ease-out motion-reduce:transition-none md:bg-black/40 ${show ? 'opacity-100' : 'opacity-0'}`}
            aria-hidden="true"
          />

          {/*
            ONE panel, responsive — a bottom sheet under md (slides up), a centred card from md
            (scales/fades). It used to be two sibling copies with one display:none'd per
            viewport, which meant `children` MOUNTED twice: two live forms whose state could
            diverge, double fetches from children's effects, and two Turnstile challenges per
            open. The wrapper is bottom-anchored on phones and centred on desktop; everything
            else is the same element restyled at the breakpoint.
          */}
          <div
            className="fixed inset-0 z-[90] flex items-end justify-center md:items-center"
            role="dialog"
            aria-modal="true"
            onClick={close}
          >
            <div
              style={duration}
              onClick={(e) => e.stopPropagation()}
              className={`flex max-h-[80vh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white transition ease-out motion-reduce:transition-none dark:border-slate-700 dark:bg-slate-900 md:max-w-sm md:rounded-2xl md:border md:shadow-2xl ${
                show
                  ? 'translate-y-0 opacity-100 md:scale-100'
                  : 'translate-y-full opacity-100 md:translate-y-0 md:scale-95 md:opacity-0'
              }`}
            >
              <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-slate-300 md:hidden dark:bg-slate-600" />
              {title && (
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
                    aria-label={t('close')}
                  >
                    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {/* pb-10 under md clears the home-indicator strip; desktop evens back to p-5. */}
              <div className="overflow-y-auto p-5 pb-10 md:pb-5">{children}</div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
