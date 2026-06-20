'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';

interface PopoverSheetProps {
  /** Trigger element. Pass a render function to receive the `open` state (e.g. for chevron rotation). */
  trigger?: ReactNode | ((open: boolean) => ReactNode);
  /** Optional heading shown in the sheet/popup header */
  title?: string;
  children: ReactNode;
  /** Controlled open state — when provided, the sheet is controlled externally */
  forceOpen?: boolean;
  /** Called when the sheet requests to close (controlled mode) */
  onClose?: () => void;
}

export default function PopoverSheet({ trigger, title, children, forceOpen, onClose }: PopoverSheetProps) {
  const t = useTranslations('nav');
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = forceOpen !== undefined;
  const open = isControlled ? forceOpen : internalOpen;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const close = useCallback(() => {
    if (isControlled) {
      onClose?.();
    } else {
      setInternalOpen(false);
    }
  }, [isControlled, onClose]);

  function toggle() {
    if (isControlled) return;
    setInternalOpen((v) => !v);
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Prevent body scroll while open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const triggerNode = trigger
    ? (typeof trigger === 'function' ? trigger(open) : trigger)
    : null;

  return (
    <div ref={wrapRef} className={triggerNode ? 'relative inline-block' : ''}>
      {triggerNode && <div className="h-full" onClick={toggle}>{triggerNode}</div>}

      {open && mounted && createPortal(
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/50 md:bg-black/40 md:backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />

          {/* ── Mobile: bottom sheet ── */}
          <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-2xl border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 md:hidden">
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
            {title && (
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
                  aria-label={t('close')}
                >
                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            <div className="overflow-y-auto px-5 py-4 pb-10">{children}</div>
          </div>

          {/* ── Desktop: centred popup ── */}
          <div
            className="fixed inset-0 z-50 hidden items-center justify-center md:flex"
            role="dialog"
            aria-modal="true"
            onClick={close}
          >
            <div
              className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              {title && (
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
                    aria-label={t('close')}
                  >
                    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              <div className="overflow-y-auto p-5">{children}</div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
