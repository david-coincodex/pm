'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import PopoverSheet from '@/components/PopoverSheet';
import { ErrorText, Field, inputClasses, useAuthError } from './ui';

/** The word the visitor has to type. Uppercase, and compared exactly — see the note below. */
const CONFIRM_WORD = 'DELETE';

/**
 * Permanent account deletion, behind two deliberate obstacles.
 *
 * Typing DELETE is a speed bump against the mis-click, not a security control — so accounts
 * that HAVE a password must also re-enter it, which is what actually stops a borrowed or
 * hijacked session from destroying an account. A Google account has no password to re-enter;
 * there its Google-issued session is the proof, the same asymmetry set-password lives by. The
 * CMS re-checks both, so neither gate is client-side theatre.
 *
 * The typed word is NOT translated: it is a literal the API compares byte-for-byte, and a
 * localized keyword would mean the backend accepting a different string per language.
 */
export default function DeleteAccountSection({ requiresPassword }: { requiresPassword: boolean }) {
  const t = useTranslations('account');
  const errorText = useAuthError();
  const [open, setOpen] = useState(false);
  const [confirmWord, setConfirmWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = confirmWord.trim() === CONFIRM_WORD;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!armed) return;
    setError(null);
    setBusy(true);
    const password = String(new FormData(e.currentTarget).get('password') ?? '');
    try {
      const res = await fetch('/api/auth/delete-account/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: CONFIRM_WORD, ...(requiresPassword ? { password } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) {
        setError(data.code === 'invalid_credentials' ? t('deleteWrongPassword') : errorText(data.code));
        return;
      }
      // The account is gone and the cookie with it, so a full load is the only honest next
      // state: every server component re-renders signed out.
      window.location.assign('/');
    } catch {
      setError(t('accountError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-12 border-t border-slate-200 pt-8 dark:border-slate-800">
      <h2 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">{t('deleteTitle')}</h2>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{t('deleteIntro')}</p>
      <button
        type="button"
        onClick={() => {
          setConfirmWord('');
          setError(null);
          setOpen(true);
        }}
        className="rounded-xl border border-red-300 px-5 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
      >
        {t('deleteAction')}
      </button>

      <PopoverSheet title={t('deleteTitle')} forceOpen={open} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('deleteWarning')}</p>

          <Field label={t('deleteConfirmLabel', { word: CONFIRM_WORD })}>
            <input
              value={confirmWord}
              onChange={(e) => setConfirmWord(e.target.value)}
              // No autocomplete/autocorrect: a phone helpfully capitalising or completing this
              // would fight the exact-match check.
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className={inputClasses}
              placeholder={CONFIRM_WORD}
            />
          </Field>

          {requiresPassword && (
            <Field label={t('currentPassword')}>
              <input name="password" type="password" required autoComplete="current-password" className={inputClasses} />
            </Field>
          )}

          {error && <ErrorText>{error}</ErrorText>}

          <button
            type="submit"
            disabled={busy || !armed}
            className="w-full rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-700"
          >
            {busy ? '…' : t('deleteConfirmAction')}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full text-center text-sm font-semibold text-slate-500 hover:underline dark:text-slate-400"
          >
            {t('deleteCancel')}
          </button>
        </form>
      </PopoverSheet>
    </section>
  );
}
