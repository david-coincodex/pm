import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';

/**
 * One filter-row link — checkbox (multi-select facets) or radio (exclusive views) — shared by
 * the server-rendered rail groups and the client-rendered language group, so they never drift.
 * No 'use client': usable from both trees.
 */
export default function FilterCheckRow({
  href,
  checked,
  label,
  variant = 'checkbox',
  icon,
  meta,
}: {
  href: string;
  checked: boolean;
  label: string;
  variant?: 'checkbox' | 'radio';
  /** Rendered between the control and the label — e.g. a CountryFlag circle. Typed via the
   * Link's own children type (the OfferLink pattern): the monorepo hoists next-intl to the
   * root where react types resolve v18, and a plain v19 ReactNode won't cross-assign. */
  icon?: ComponentProps<typeof Link>['children'];
  /** Muted trailing text at the row's right edge — e.g. a live model count. */
  meta?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={checked ? 'true' : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition ${
        checked
          ? 'font-semibold text-emerald-700 dark:text-emerald-400'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {variant === 'radio' ? (
        <span
          aria-hidden="true"
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
            checked ? 'border-emerald-600 dark:border-emerald-500' : 'border-slate-300 dark:border-slate-600'
          }`}
        >
          {checked && <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-500" />}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
            checked
              ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500'
              : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
          }`}
        >
          {checked && (
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </span>
      )}
      {icon}
      {label}
      {meta !== undefined && (
        <span className="ml-auto text-xs tabular-nums text-slate-400 dark:text-slate-500">{meta}</span>
      )}
    </Link>
  );
}
