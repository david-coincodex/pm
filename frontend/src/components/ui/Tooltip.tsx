'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * The shared tooltip bubble — one look for every tooltip on the site. Exported separately for
 * surfaces that manage their own open state and positioning (e.g. the activity heatmap, which
 * floats ONE bubble over hundreds of cells instead of mounting a Tooltip per cell).
 */
export function TooltipBubble({
  className = '',
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span
      role="tooltip"
      style={style}
      className={`pointer-events-none z-30 block whitespace-nowrap rounded-lg bg-slate-900/95 px-2.5 py-1.5 text-left text-xs font-normal normal-case tracking-normal text-white shadow-lg dark:bg-slate-700 ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Tooltip around an inline trigger. Shows on hover and keyboard focus; on touch devices
 * (no hover) a tap toggles it and a tap anywhere else dismisses it — the click handler is
 * what makes it work on mobile, not a nicety.
 */
export default function Tooltip({
  content,
  children,
  className = '',
  align = 'center',
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  /** 'center' under the trigger, or 'start' when the trigger sits near a container edge. */
  align?: 'center' | 'start';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <span
      ref={ref}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen(true)}
    >
      {children}
      {open && (
        <TooltipBubble
          className={`absolute top-full mt-1.5 ${align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'}`}
        >
          {content}
        </TooltipBubble>
      )}
    </span>
  );
}
