'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import TurnstileWidget, { CAPTCHA_CONFIGURED } from './TurnstileWidget';
import { Field, Notice, SubmitButton, inputClasses, useAuthError } from './ui';

/**
 * Request a reset link. Always reports success, whatever the answer upstream — the BFF
 * deliberately cannot tell us whether the address has an account, because that difference is
 * an account-enumeration oracle.
 *
 * Rendered both as a step inside the account popup (with `onBack`, so the visitor can return to
 * sign-in without losing the card) and as the standalone /account/forgot-password/ page.
 */
export default function ForgotPasswordForm({ onBack }: { onBack?: () => void } = {}) {
  const t = useTranslations('account');
  const errorText = useAuthError();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // See AuthForm: a Turnstile token is single-use, so a retry needs a new challenge.
  const [captchaRound, setCaptchaRound] = useState(0);
  const [captchaBlocked, setCaptchaBlocked] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const email = String(new FormData(e.currentTarget).get('email') ?? '');
    try {
      const res = await fetch('/api/auth/forgot-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, captchaToken }),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) throw new Error(errorText(data.code));
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accountError'));
      setCaptchaToken(null);
      setCaptchaRound((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Notice>{t('forgotSent')}</Notice>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-full text-center text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            {t('backToSignIn')}
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}
      {captchaBlocked && <Notice tone="error">{t('captchaBlocked')}</Notice>}
      <p className="text-sm text-slate-500 dark:text-slate-400">{t('forgotSubtitle')}</p>
      <Field label={t('email')}>
        <input name="email" type="email" required autoComplete="email" className={inputClasses} />
      </Field>
      <TurnstileWidget
        key={captchaRound}
        onToken={setCaptchaToken}
        onUnavailable={() => setCaptchaBlocked(true)}
      />
      <SubmitButton busy={busy || (CAPTCHA_CONFIGURED && !captchaToken)}>{t('sendResetLink')}</SubmitButton>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="w-full text-center text-sm font-semibold text-slate-500 hover:underline dark:text-slate-400"
        >
          {t('backToSignIn')}
        </button>
      )}
    </form>
  );
}
