'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getPathname } from '@/i18n/navigation';
import { routes } from '@/lib/routes';
import { MIN_PASSWORD_LENGTH } from '@/lib/accountPolicy';
import { ErrorText, Field, Notice, SubmitButton, inputClasses, useAuthError } from './ui';

/**
 * "Choose a password" — the last step of signup, and the way a Google account adds one.
 *
 * No current password is asked for, and none exists to ask for: this form is only reachable
 * with a session that has just proved mailbox ownership (or a Google identity), and the CMS
 * re-checks that on its side. Changing an existing password is a different form.
 *
 * Used by the confirmation page, the signup popup's no-email mode, and account settings —
 * same component, so the rules and the copy cannot diverge between them.
 */
export default function SetPasswordForm({
  hint,
  notice,
  submitLabel,
  after = 'favorites',
}: {
  hint?: string;
  /** Warning shown above the fields (settings uses it for the Google conversion notice). */
  notice?: string;
  submitLabel?: string;
  /**
   * Where success leads. 'favorites' finishes signup by dropping the visitor somewhere useful;
   * 'reload' re-renders the settings page, which then offers change-password instead. A string
   * rather than a callback because server components render this and cannot pass functions.
   */
  after?: 'favorites' | 'reload';
}) {
  const t = useTranslations('account');
  const errorText = useAuthError();
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const res = await fetch('/api/auth/set-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) throw new Error(errorText(data.code));
      if (after === 'reload') window.location.reload();
      else window.location.assign(getPathname({ href: routes.favorites(), locale }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accountError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {notice && <Notice tone="info">{notice}</Notice>}
      {hint && <p className="text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
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
      {error && <ErrorText>{error}</ErrorText>}
      <SubmitButton busy={busy}>{submitLabel ?? t('savePassword')}</SubmitButton>
    </form>
  );
}
