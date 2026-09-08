'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import TurnstileWidget, { CAPTCHA_CONFIGURED } from './TurnstileWidget';
import type { AuthMode } from './authModalContext';
import SetPasswordForm from './SetPasswordForm';
import SuccessCheck from './SuccessCheck';
import { GoogleButton, OrDivider } from './GoogleSignInButton';
import { ErrorText, Field, Notice, SubmitButton, inputClasses, useAuthError } from './ui';

/**
 * Sign-in and sign-up, in the popup and on the static /account/login|register pages alike.
 *
 * Signing up is deliberately three small steps instead of one big form:
 *   1. here — an email address, nothing else;
 *   2. the link in that email (a real page, /account/confirm, not this popup: the click can
 *      land in a different browser or days later, so the flow must survive leaving the page);
 *   3. choosing a password, on whichever surface step 2 finished on.
 *
 * Step 3 also happens right here when the CMS has no mailer configured: registration then
 * returns a session immediately, and `next` in the response says so — the client never has to
 * be told out-of-band which mode the backend is in.
 *
 * On success we hard-navigate rather than router.push: the session is an httpOnly cookie, and
 * a full load is what makes every server component (header, favorites) see it at once.
 */
export default function AuthForm({
  mode,
  initialError,
  infoMessage,
  onSwitchMode,
  onStepChange,
}: {
  mode: 'login' | 'register';
  /** Pre-filled failure, e.g. Google sign-in bouncing back with `?error=email_taken`. */
  initialError?: string;
  /**
   * Why the popup opened — set when something other than the visitor triggered it (tapping a
   * heart while signed out, say). Survives the login/sign-up switch: the reason they are here
   * has not changed just because they picked a different door.
   */
  infoMessage?: string;
  /** The popup owns the mode, because its header shows it — see AuthModal. */
  onSwitchMode: (mode: AuthMode) => void;
  /**
   * Reports the internal step up, so the popup's TITLE can follow it: once the address is
   * submitted the heading should read "Check your inbox", not "Create your free account".
   */
  onStepChange?: (step: 'form' | 'check_email' | 'set_password') => void;
}) {
  const t = useTranslations('account');
  const errorText = useAuthError();

  const [step, setStepState] = useState<'form' | 'check_email' | 'set_password'>('form');
  const setStep = (next: 'form' | 'check_email' | 'set_password') => {
    setStepState(next);
    onStepChange?.(next);
  };
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(
    // The `?error=` codes come from two places, and only Google's need special copy:
    //  - `email_taken` (only the Google callback emits it via the URL — register is
    //    enumeration-safe and never does) means the address already signs in with a password,
    //    which stock users-permissions will not link to a Google identity;
    //  - `google` is the callback's generic failure.
    // Everything else — `invalid_code` from a dead confirmation/reset link, `upstream`,
    // `blocked`, `rate_limited` — is a real code with its own copy, so it goes through the
    // shared map. (Before, all of these fell through to "Google sign-in didn't work", so a
    // used confirmation link claimed Google was broken.)
    initialError
      ? initialError === 'email_taken'
        ? t('googleEmailTaken')
        : initialError === 'google'
          ? t('googleSignInFailed')
          : errorText(initialError)
      : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [offerResend, setOfferResend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Bumped after every failed attempt to remount the widget. A Turnstile token is SINGLE-USE:
  // resubmitting the same one (fix a typo'd email, retry after a rate limit) is rejected by
  // Cloudflare, which would show "we couldn't verify you're human" for a perfectly human retry.
  const [captchaRound, setCaptchaRound] = useState(0);
  const [captchaBlocked, setCaptchaBlocked] = useState(false);
  const freshCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaRound((n) => n + 1);
  };

  /**
   * A full RELOAD of wherever they already are, not a jump to favorites.
   *
   * The session is an httpOnly cookie, so only a fresh document makes the server components
   * (the header's account control above all) see it — a soft refresh would leave the top-right
   * button showing "Create free account" to somebody who just signed in. Reloading in place
   * also keeps the visitor on the page they were browsing, which is the whole point of signing
   * in from a popup rather than a separate page.
   */
  const reloadWithSession = () => window.location.reload();

  /** Every call here answers `{ code }` on failure — see lib/authApi.ts. */
  async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(errorText(data.code), { cause: data.code });
    return data;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOfferResend(false);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      if (mode === 'register') {
        const address = String(form.get('email') ?? '');
        const data = await post('/api/auth/register/', { email: address, captchaToken });
        setEmail(address);
        setStep(data.next === 'set_password' ? 'set_password' : 'check_email');
        return;
      }

      await post('/api/auth/login/', {
        identifier: form.get('identifier'),
        password: form.get('password'),
      });
      reloadWithSession();
    } catch (err) {
      // Offer a fresh confirmation link after ANY failed sign-in, not just an `unconfirmed`
      // reply. Someone who registered and never clicked the link cannot produce that reply:
      // their password is the random one registration assigned, so stock rejects them on
      // credentials before it ever looks at confirmation, and the honest-looking "wrong
      // password" is a dead end. The endpoint is safe to offer freely — it answers ok for
      // every address, so it reveals nothing, and it is captcha-protected.
      if (mode === 'login') {
        setEmail(String(form.get('identifier') ?? ''));
        setOfferResend(true);
      }
      setError(err instanceof Error && err.message ? err.message : t('accountError'));
      freshCaptcha();
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setBusy(true);
    try {
      await post('/api/auth/resend-confirmation/', { email, captchaToken });
      setOfferResend(false);
      setNotice(t('resendSent'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accountError'));
      freshCaptcha();
    } finally {
      setBusy(false);
    }
  }

  // A configured captcha with no token yet means the challenge is still resolving (or expired):
  // blocking the submit is friendlier than a server-side rejection the visitor can't explain.
  const captchaPending = CAPTCHA_CONFIGURED && !captchaToken;

  if (step === 'check_email') {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <SuccessCheck />
        {/* Plain body text, not a green notice box: the tick already carries the "it worked"
            signal, and stacking both made a small popup shout. No re-send button either — the
            address is stated instead, which is the thing a visitor actually needs to check. */}
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('checkEmailBody', { email })}</p>
      </div>
    );
  }

  // Degraded no-mailer mode: registration already returned a session, so step 3 happens right
  // here instead of on the confirmation page. Same component either way.
  if (step === 'set_password') {
    return <SetPasswordForm notice={t('setPasswordHint')} />;
  }

  return (
    <div className="space-y-4">
      {infoMessage && <Notice tone="info">{infoMessage}</Notice>}
      <GoogleButton />
      <OrDivider />

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === 'register' ? (
          <>
            <Field label={t('email')}>
              <input name="email" type="email" required autoComplete="email" className={inputClasses} />
            </Field>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('registerEmailHint')}</p>
            <TurnstileWidget
              key={`register-${captchaRound}`}
              onToken={setCaptchaToken}
              onUnavailable={() => setCaptchaBlocked(true)}
            />
          </>
        ) : (
          <>
            <Field label={t('email')}>
              <input name="identifier" type="email" required autoComplete="email" className={inputClasses} />
            </Field>
            <Field label={t('password')}>
              <input name="password" type="password" required autoComplete="current-password" className={inputClasses} />
            </Field>
            <p className="text-right text-sm">
              {/* A mode switch, not a link: asking for a reset link is three fields and a
                  captcha, so there is no reason to throw the visitor onto another page and
                  make them find their way back. */}
              <button
                type="button"
                onClick={() => onSwitchMode('forgot')}
                className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                {t('forgotPassword')}
              </button>
            </p>
          </>
        )}

        {captchaBlocked && <ErrorText>{t('captchaBlocked')}</ErrorText>}
        {error && <ErrorText>{error}</ErrorText>}
        {offerResend && (
          <>
            {/* The sign-in form carries no challenge of its own, so the re-send gets one here. */}
            <TurnstileWidget
              key={`resend-inline-${captchaRound}`}
              onToken={setCaptchaToken}
              onUnavailable={() => setCaptchaBlocked(true)}
            />
            <button
              type="button"
              onClick={resend}
              disabled={busy || captchaPending}
              className="text-sm font-semibold text-emerald-600 hover:underline disabled:opacity-60 dark:text-emerald-400"
            >
              {t('resend')}
            </button>
          </>
        )}
        {notice && <Notice tone="info">{notice}</Notice>}

        <SubmitButton busy={busy || (mode === 'register' && captchaPending)}>
          {mode === 'register' ? t('createAccount') : t('signIn')}
        </SubmitButton>
      </form>

      {/* Present in BOTH modes, and switches in place — no navigation, nothing typed is lost. */}
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        {mode === 'register' ? `${t('haveAccount')} ` : `${t('noAccount')} `}
        <button
          type="button"
          onClick={() => onSwitchMode(mode === 'register' ? 'login' : 'register')}
          className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
        >
          {mode === 'register' ? t('signIn') : t('createAccount')}
        </button>
      </p>
    </div>
  );
}
