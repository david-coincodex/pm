'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getPathname } from '@/i18n/navigation';
import { routes } from '@/lib/routes';
import { MIN_PASSWORD_LENGTH } from '@/lib/accountPolicy';
import { Field, Notice, SubmitButton, inputClasses, useAuthError } from './ui';

/**
 * Set a new password from the emailed code, then land signed in — the visitor just proved they
 * own the mailbox, so a login form here would be pure friction.
 *
 * For an account created through Google this also converts it to email + password sign-in
 * (the BFF flips the provider so the new password actually works), which the notice says
 * before they commit.
 */
export default function ResetPasswordForm({ code = null }: { code?: string | null } = {}) {
  const t = useTranslations('account');
  const errorText = useAuthError();
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== String(form.get('passwordConfirm') ?? '')) {
      setError(t('passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/reset-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No code in the popup path: the BFF reads it from the httpOnly cookie that the
        // emailed link parked there. Older links still pass one through the query string.
        body: JSON.stringify({ password, ...(code ? { code } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string; next?: string };
      if (!res.ok) throw new Error(errorText(data.code));
      // An address that was never confirmed can't hold a session yet: the password is saved,
      // but the confirmation link (just re-sent) is what finishes the job.
      if (data.next === 'check_email') {
        setCheckEmail(true);
        setBusy(false);
        return;
      }
      // Drop the spent reset code before navigating, so it is not handed to the next page as
      // a same-origin referrer or left in history (see the confirm-link route + Analytics.tsx).
      window.history.replaceState(null, '', window.location.pathname);
      window.location.assign(getPathname({ href: routes.favorites(), locale }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accountError'));
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <Notice>
        <p className="font-semibold">{t('checkEmailTitle')}</p>
        <p className="mt-1">{t('resetNeedsConfirmation')}</p>
      </Notice>
    );
  }

  /*
   * NO "missing code" guard any more: in the popup path the code lives in an httpOnly cookie
   * that this component cannot see, so a client-side check would reject every legitimate
   * reset. A missing or expired cookie comes back from the BFF as `invalid_code` and is shown
   * in the error slot below — the one place that actually knows.
   */
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}
      <Notice tone="info">{t('resetConversionNotice')}</Notice>
      <Field label={t('newPassword')}>
        <input
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className={inputClasses}
        />
      </Field>
      <Field label={t('confirmPassword')}>
        <input
          name="passwordConfirm"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className={inputClasses}
        />
      </Field>
      <SubmitButton busy={busy}>{t('savePassword')}</SubmitButton>
    </form>
  );
}
