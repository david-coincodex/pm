import type { ReactNode } from 'react';

/**
 * THE red live pill — the model page's LIVE tag and the listings' "2.7K live" count wear the
 * exact same size and palette, so the two surfaces can never drift apart.
 */
export default function CamLiveBadge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`items-center gap-2 rounded-full bg-red-500/10 px-3.5 py-1.5 text-sm font-bold uppercase tracking-wide text-red-500 ${className || 'flex'}`}>
      <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
      {children}
    </span>
  );
}
