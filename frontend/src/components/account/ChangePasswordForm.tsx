'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MIN_PASSWORD_LENGTH } from '@/lib/accountPolicy';
import { Field, Notice, SubmitButton, inputClasses, useAuthError } from './ui';

/**
 * Change an existing password. The current one is required — that is the whole difference from
 * SetPasswordForm, and the reason a stolen session cannot silently take an account over.
 */
export default function ChangePasswordForm() {
  const t = useTranslations('account');
  const errorText = useAuthError();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    if (password !== String(data.get('passwordConfirm') ?? '')) {
      setError(t('passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/change-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: data.get('currentPassword'), password }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) throw new Error(errorText(body.code));
      form.reset();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accountError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice>{t('passwordChanged')}</Notice>}
      <Field label={t('currentPassword')}>
        <input name="currentPassword" type="password" required autoComplete="current-password" className={inputClasses} />
      </Field>
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
      <SubmitButton busy={busy}>{t('changePassword')}</SubmitButton>
    </form>
  );
}
