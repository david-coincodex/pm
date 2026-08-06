/**
 * Thin gtag wrapper.
 *
 * Every call is a no-op when gtag is absent — which is the normal case in development (GA only
 * loads in production, see components/Analytics.tsx) and whenever a visitor blocks trackers.
 * Callers therefore never need to guard, and a blocked script can never break a click handler.
 */

type GtagParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (command: 'event' | 'config' | 'js', targetOrName: string | Date, params?: GtagParams) => void;
    dataLayer?: unknown[];
  }
}

/** GA4 measurement ID. Env var wins so staging can point somewhere else (or nowhere). */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID ?? 'G-TYBK5ZPHL9';

/** Send a GA4 event. Silently does nothing if analytics is unavailable. */
export function trackEvent(name: string, params: GtagParams = {}): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  // Drop undefined values — GA renders them as the literal string "undefined" in reports.
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
  window.gtag('event', name, clean);
}
