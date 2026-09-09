'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { siteSettings } from '@/lib/siteSettings';
import AuthModal from './AuthModal';
import { AuthModalContext, type AuthMode as Mode } from './authModalContext';

/**
 * Owns THE ONE sign-in popup and hands out the ability to open it.
 *
 * There are no /account/login or /account/register pages, so this is the only way in. Two
 * things can trigger it:
 *
 *  1. a client component calling `useAuthModal().open()` — the header's account button, the
 *     heart on a cam card, the favorites hint on a listing;
 *  2. `?auth=login` / `?auth=register` on any URL, which is how SERVER code reaches the popup:
 *     `/account/settings` redirects a signed-out visitor with it, and the Google callback route
 *     adds `&error=…` when the provider handed back a failure. It also makes the popup
 *     linkable, which is what the deleted pages used to be for.
 *
 * The parameter is wiped from the address bar as soon as it is read, so a refresh or a shared
 * link does not reopen the popup, and `?error=` never lands in analytics.
 */

type AuthRequest = { mode: Mode; error?: string; message?: string };

/**
 * Watches the URL for `?auth=`, REACTIVELY — this must be `useSearchParams`, not a one-shot
 * read of `window.location`. A previous version latched the query string at first render (to
 * keep a getSnapshot stable while the cleanup below rewrote the URL), and that broke every
 * client-side navigation to a `?auth=` link: the provider never remounts on soft navigation,
 * so the latched value never updated and the sign-in links on the filter page and the confirm
 * page silently did nothing.
 *
 * It is its own null-rendering component behind Suspense because that is the deal Next offers
 * for `useSearchParams` under static rendering: only this boundary's content defers to the
 * client, and the pages around it stay static. Rendering nothing, it has nothing to defer.
 */
function AuthParamWatcher({ onRequest }: { onRequest: (request: AuthRequest) => void }) {
  const searchParams = useSearchParams();
  const auth = searchParams.get('auth');
  const error = searchParams.get('error');

  useEffect(() => {
    const MODES = ['login', 'register', 'forgot', 'set-password', 'confirmed', 'reset'] as const;
    if (!MODES.includes(auth as (typeof MODES)[number])) return;
    onRequest({ mode: auth as Mode, error: error ?? undefined });
    // Consume the parameters: a refresh or a copied link must not reopen the popup, and
    // ?error= must not linger for analytics. The popup itself lives in state by now.
    const params = new URLSearchParams(window.location.search);
    params.delete('auth');
    params.delete('error');
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  }, [auth, error, onRequest]);

  return null;
}

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<AuthRequest | null>(null);
  /**
   * Which providers the CMS has enabled, fetched the FIRST time the popup opens rather than on
   * every page load: the chrome layout deliberately does no I/O (it would delay the first byte
   * of every page), and nobody needs this until they are looking at the form. The BFF caches
   * it for a minute, so this costs one request per visitor at most.
   */
  const [googleClientId, setGoogleClientId] = useState('');

  const open = useCallback((mode: Mode = 'login', message?: string) => setRequest({ mode, message }), []);
  const close = useCallback(() => setRequest(null), []);
  const openFromUrl = useCallback((req: AuthRequest) => setRequest(req), []);

  const isOpen = request !== null;
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/providers/');
        const data = (await res.json()) as { google?: { enabled?: boolean; clientId?: string } };
        if (!cancelled && data.google?.enabled && data.google.clientId) setGoogleClientId(data.google.clientId);
      } catch {
        // No Google button; the email form is unaffected.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const api = useMemo(() => ({ open, close, googleClientId }), [open, close, googleClientId]);

  // Accounts off: no popup, no context — `useAuthModal` then hands callers the no-op, and every
  // heart and account button is hidden by its own flag check anyway.
  if (!siteSettings.features.accounts) return <>{children}</>;

  return (
    <AuthModalContext.Provider value={api}>
      {children}
      <Suspense fallback={null}>
        <AuthParamWatcher onRequest={openFromUrl} />
      </Suspense>
      <AuthModal
        open={isOpen}
        initialMode={request?.mode ?? 'login'}
        initialError={request?.error}
        infoMessage={request?.message}
        onClose={close}
      />
    </AuthModalContext.Provider>
  );
}
