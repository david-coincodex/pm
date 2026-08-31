import type { ReactNode } from 'react';

/**
 * The pill primitive: icon + label in a bordered capsule. Every pill-shaped stat or badge
 * composes this so spacing, radius and palette stay identical everywhere.
 */
export default function Pill({ icon, children, className = '' }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
