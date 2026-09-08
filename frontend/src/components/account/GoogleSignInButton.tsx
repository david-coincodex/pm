'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { googleRedirectUrl, requestGoogleAccessToken } from '@/lib/googleSignIn';
import { ErrorText, useAuthError } from './ui';
import { useAuthModal } from './authModalContext';

/**
 * The CMS-gated wrapper: renders nothing until the provider lookup says Google is enabled
 * (either from GOOGLE_CLIENT_ID or from Settings → Users & Permissions plugin → Providers).
 *
 * These live HERE and not in ui.tsx so the module graph stays one-directional: this file
 * imports ui.tsx's primitives, so ui.tsx must never import back. A cycle in exactly this
 * cluster once resolved a context to undefined at module-eval time and blanked the popup.
 */
export function GoogleButton() {
  const { googleClientId } = useAuthModal();
  if (!googleClientId) return null;
  return <GoogleSignInButton clientId={googleClientId} />;
}

/** "or" rule between the Google button and the email form; hidden alongside it. */
export function OrDivider() {
  const t = useTranslations('account');
  const { googleClientId } = useAuthModal();
  if (!googleClientId) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('or')}</span>
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

/**
 * "Continue with Google" — one button, one Google identity, in both sign-in and sign-up modes:
 * the stock provider flow signs the visitor in or creates the account as needed.
 *
 * It tries Google's POPUP first (the account picker in a window over the page, no navigation)
 * and falls back to the old full-page redirect through the CMS if Google's script cannot load.
 * Either way the token is exchanged for a session by our BFF, server-side, so the Strapi JWT
 * still only ever exists in the httpOnly cookie.
 *
 * Hidden entirely when no client id is configured — a button that leads to a Strapi error page
 * is worse than no button.
 */
export default function GoogleSignInButton({ clientId }: { clientId: string }) {
  const t = useTranslations('account');
  const errorText = useAuthError();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once Google's script proves unavailable; the button becomes a plain redirect link. */
  const [redirectOnly, setRedirectOnly] = useState(false);

  async function onClick() {
    setError(null);
    setBusy(true);
    try {
      const accessToken = await requestGoogleAccessToken(clientId);
      const res = await fetch('/api/auth/google/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) {
        // `email_taken` is the one worth explaining: the address already signs in with a
        // password, and stock users-permissions will not link the two accounts.
        setError(data.code === 'email_taken' ? t('googleEmailTaken') : errorText(data.code));
        return;
      }
      // Full reload of the page they were already on: the cookie is httpOnly, so only a fresh
      // document makes the server components (the header included) see the session — and they
      // keep their place instead of being thrown to another page.
      window.location.reload();
    } catch (err) {
      const reason = err instanceof Error ? err.message : '';
      // Closing the picker is not an error worth shouting about; a script that never loaded is,
      // and it means this browser needs the redirect path instead.
      if (/gsi (failed|timeout|missing)|server/.test(reason)) {
        setRedirectOnly(true);
        setError(t('googlePopupUnavailable'));
      } else if (!/popup closed|closed|denied|abort/i.test(reason)) {
        setError(t('googleSignInFailed'));
      }
    } finally {
      setBusy(false);
    }
  }

  const classes =
    'flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';

  return (
    <div className="space-y-2">
      {redirectOnly ? (
        <a href={googleRedirectUrl()} className={classes}>
          <GoogleMark />
          {t('continueWithGoogle')}
        </a>
      ) : (
        <button type="button" onClick={onClick} disabled={busy} className={classes}>
          <GoogleMark />
          {busy ? '…' : t('continueWithGoogle')}
        </button>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H1.05v2.34A8.99 8.99 0 009 18z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 010-3.44V4.94H1.05a9 9 0 000 8.12l2.92-2.34z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A8.99 8.99 0 001.05 4.94l2.92 2.34C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
