import type { ReactNode } from 'react';

/**
 * The pill primitive: icon + label in a bordered capsule. Every pill-shaped stat or badge
 * composes this so spacing, radius and palette stay identical everywhere.
 *
 * Labels TRUNCATE, never wrap: a pill is a single-line capsule by definition, and free-text
 * values (model locations, long durations) were folding the sidebar stats onto two lines.
 * String labels keep their full text reachable via the native title.
 */
export default function Pill({ icon, children, className = '' }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 ${className}`}
    >
      {icon && <span className="flex shrink-0 items-center">{icon}</span>}
      <span className="truncate" title={typeof children === 'string' ? children : undefined}>
        {children}
      </span>
    </span>
  );
}
