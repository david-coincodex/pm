'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * The shared parts of every account form (popup, login/register pages, reset, settings).
 * One definition each so the popup and the static pages cannot drift apart visually — they
 * render the same components, only the surface around them differs.
 */

export const inputClasses =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:ring-emerald-500/30';

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
    >
      {busy ? '…' : children}
    </button>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-red-500">
      {children}
    </p>
  );
}

export function Notice({ children, tone = 'success' }: { children: ReactNode; tone?: 'success' | 'info' | 'error' }) {
  const styles =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
      : tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300';
  // The error tone is a live region so a screen reader announces it, the same job the old
  // inline ErrorText's role="alert" did.
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={`rounded-xl border p-4 text-sm ${styles}`}>
      {children}
    </div>
  );
}

/**
 * Turns a BFF error code into localized copy. The BFF never sends user-facing English (Strapi's
 * messages are English literals in its source), so this is the only place failures get words —
 * an unknown code degrades to the generic message rather than showing a raw code.
 */
export function useAuthError() {
  const t = useTranslations('account.errors');
  return (code: unknown): string => (isErrorCode(code) ? t(code) : t('upstream'));
}

/**
 * Mirrors `AuthErrorCode` in lib/authApi.ts. Listed rather than inferred so the message file
 * is type-checked against it: a code with no copy is a compile error, not a raw slug on screen.
 */
const ERROR_CODES = [
  'accounts_disabled',
  'bad_request',
  'captcha',
  'email_invalid',
  'email_disposable',
  'email_unreachable',
  'email_taken',
  'invalid_credentials',
  'unconfirmed',
  'blocked',
  'invalid_code',
  'password_required',
  'password_too_short',
  'password_already_set',
  'wrong_password',
  'rate_limited',
  'unauthorized',
  'upstream',
] as const;

function isErrorCode(value: unknown): value is (typeof ERROR_CODES)[number] {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}
