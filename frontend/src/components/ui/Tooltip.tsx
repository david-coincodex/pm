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
  desktopOnly = false,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Where the bubble sits under the trigger: 'center', or 'start'/'end' when the trigger is
   * near a container edge that centring would overflow.
   */
  align?: 'center' | 'start' | 'end';
  /**
   * Suppress the tooltip on touch devices, for a trigger whose tap must do its own job
   * instead. A hint that only labels an already-labelled control is desktop affordance; on a
   * phone it steals the tap, or pops up over the thing just tapped.
   *
   * Detected by POINTER CAPABILITY, not by screen width — a tablet is wide and still touch,
   * a small laptop window is narrow and still has a mouse. Checked when opening rather than
   * at mount, so the server and the first client render agree (the tooltip starts closed
   * either way) and there is no hydration mismatch.
   */
  desktopOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    if (desktopOnly && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    setOpen(true);
  };

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
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
      // Tap-to-open is what makes a tooltip reachable on touch — except in desktopOnly mode,
      // where the tap belongs to the trigger.
      onClick={desktopOnly ? undefined : () => setOpen(true)}
    >
      {children}
      {open && (
        <TooltipBubble
          className={`absolute top-full mt-1.5 ${
            align === 'center'
              ? 'left-1/2 -translate-x-1/2'
              : align === 'end'
                ? 'right-0'
                : 'left-0'
          }`}
        >
          {content}
        </TooltipBubble>
      )}
    </span>
  );
}
