'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Resets scroll to the top on every route (pathname) change.
 *
 * next-intl's <Link> does client-side navigation, and the Next.js App Router
 * does not reliably scroll to top on that navigation (a known framework bug),
 * so a menu link followed from the bottom of one page would otherwise open the
 * next page still scrolled down. This is the standard fix.
 *
 * Keyed on `pathname` only, so it does NOT fire on `?page=` pagination (same
 * pathname) — that stays handled by <PaginationScrollAnchor>. Skips when the URL
 * has a #hash so in-page anchor / deep-link targets aren't clobbered.
 */
export default function ScrollToTopOnNavigate() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
