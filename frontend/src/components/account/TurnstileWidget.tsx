'use client';

import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile, rendered explicitly so the token lands in the form that needs it.
 *
 * Renders NOTHING when no site key was baked into the build (the dev default), and the BFF
 * skips verification in exactly that case — the two switches are the same env pair, so the
 * widget can never be missing while the server still demands a token.
 *
 * The managed widget is normally invisible: real visitors see a brief spinner at most, which
 * is why it sits inline in the form rather than behind a "prove you're human" step.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/**
 * Space reserved for the widget before its script has rendered anything, so the form below it
 * cannot jump down mid-typing.
 *
 * 71px is MEASURED, not the documented number. Cloudflare's docs say 65px for both 'normal'
 * and 'flexible' (only 'compact' differs, at 140px), but the box it actually renders is 71 —
 * the 65px widget plus its own border and padding — identically at 320/390/768/1440. Reserving
 * the documented 65 left the real widget overflowing its holder by 6px.
 */
const WIDGET_HEIGHT_PX = 71;

export const CAPTCHA_CONFIGURED = Boolean(SITE_KEY);

type Turnstile = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'auto' | 'light' | 'dark';
      appearance?: 'always' | 'execute' | 'interaction-only';
      size?: 'normal' | 'flexible' | 'compact';
    },
  ) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

/** Loads the script at most once per page, even with several widgets mounted. */
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    // A tag whose load already fired (or already failed) will never fire again, so waiting on
    // the event alone can hang forever — and a hung promise here reads to the visitor as a
    // permanently disabled submit button. Time out instead, into the same "unavailable" path.
    return Promise.race([
      new Promise<void>((resolve) =>
        existing.addEventListener('load', () => resolve(), { once: true }),
      ),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('turnstile script stalled')), 8000),
      ),
    ]);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile script failed'));
    document.head.appendChild(script);
  });
}

export default function TurnstileWidget({
  onToken,
  onUnavailable,
}: {
  onToken: (token: string | null) => void;
  /**
   * The widget could not load at all — almost always a content blocker, which this audience
   * runs more than most. Without this the form would sit behind a disabled submit button for
   * a reason the visitor cannot see, so the caller uses it to say what happened.
   */
  onUnavailable?: () => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  // The callback identity changes on every parent render; keeping it in a ref means the widget
  // is created once instead of being torn down and re-rendered mid-challenge.
  const onTokenRef = useRef(onToken);
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onTokenRef.current = onToken;
    onUnavailableRef.current = onUnavailable;
  }, [onToken, onUnavailable]);

  useEffect(() => {
    if (!SITE_KEY || !holder.current) return;
    const el = holder.current;
    let widgetId: string | null = null;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId = window.turnstile.render(el, {
          sitekey: SITE_KEY,
          theme: 'auto',
          // Fills the container instead of sitting as a 300px island in a wider form. Same
          // 65px height as 'normal', which is what WIDGET_HEIGHT_PX reserves.
          size: 'flexible',
          callback: (token) => onTokenRef.current(token),
          // A token is single-use and expires after ~5 minutes; clearing it makes the form ask
          // for a fresh one rather than submitting something the server will reject.
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        // Script blocked (a content blocker, a network hiccup). The token stays null, which
        // keeps the submit disabled — so tell the caller, which tells the visitor.
        onUnavailableRef.current?.();
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  if (!SITE_KEY) return null;
  /**
   * The box is ALWAYS visible once a site key is baked in — `appearance` is left at its default
   * of 'always', so even a visitor who passes silently still gets the widget's "Success!"
   * chrome. But it appears only once the remote script has loaded and rendered, so the space
   * has to be reserved up front or the form below it jumps down mid-typing.
   *
   * `minHeight` rather than a hard `height`, since the reservation is a measured constant: if
   * Cloudflare ever renders taller the box grows instead of letting the widget spill over the
   * submit button — a small shift beats an overlap. `w-full` pairs with `size: 'flexible'`
   * above, which is what makes it span the form instead of sitting as a 300px island.
   */
  return <div ref={holder} style={{ minHeight: WIDGET_HEIGHT_PX }} className="w-full" />;
}
