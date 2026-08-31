'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, getPathname } from '@/i18n/navigation';
import { routes } from '@/lib/routes';

const inputClasses =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:ring-emerald-500/30';

/**
 * Login + register forms over the BFF auth routes. On success the httpOnly cookie is already
 * set by the route handler — a hard navigation makes every server component see it at once.
 */
export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const t = useTranslations('account');
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      if (mode === 'register') {
        const res = await fetch('/api/auth/register/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: form.get('email'),
            password: form.get('password'),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!data.confirmed) {
          setNotice(t('checkEmail')); // email confirmation is on — no JWT until confirmed
          return;
        }
      } else {
        const res = await fetch('/api/auth/login/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: form.get('identifier'), password: form.get('password') }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      }
      // Full reload so server components + the favorites provider pick up the new cookie.
      // getPathname adds the locale prefix that window.location bypasses (next-intl Links get it free).
      window.location.assign(getPathname({ href: routes.favorites(), locale }));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('accountError'));
    } finally {
      setBusy(false);
    }
  }

  if (notice) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
        {notice}
        <div className="mt-3">
          <Link href={routes.login()} className="font-semibold underline">
            {t('signIn')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === 'register' ? (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('email')}</span>
          <input name="email" type="email" required autoComplete="email" className={inputClasses} />
        </label>
      ) : (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('email')}</span>
          <input name="identifier" type="email" required autoComplete="email" className={inputClasses} />
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('password')}</span>
        <input
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          className={inputClasses}
        />
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
      >
        {busy ? '…' : mode === 'register' ? t('createAccount') : t('signIn')}
      </button>

      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        {mode === 'register' ? (
          <>
            {t('haveAccount')}{' '}
            <Link href={routes.login()} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
              {t('signIn')}
            </Link>
          </>
        ) : (
          <>
            {t('noAccount')}{' '}
            <Link href={routes.register()} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
              {t('createAccount')}
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
