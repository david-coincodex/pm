'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import SearchContent from '@/components/SearchContent';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MobileSearchOverlay({ open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('search');

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [open]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const hasQuery = query.trim().length > 0;

  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-[80] flex flex-col bg-white dark:bg-slate-900 md:hidden">
      {/* Top bar: back arrow + input + clear X */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-100 px-3 dark:border-slate-800">
        {/* Back arrow */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('backLabel')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>

        {/* Input — clean, no border/bg */}
        <div className="relative flex-1">
          <input
            ref={inputRef}
            // Distinct id from the desktop SearchBar: both can be in the DOM at once, and
            // duplicate ids are invalid and break label/ARIA association.
            id="site-search-mobile"
            name="site-search-mobile"
            type="search"
            aria-label={t('label')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('placeholder')}
            autoComplete="off"
            className="w-full bg-transparent py-2 pl-1 pr-8 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          {/* Clear X — only when text exists */}
          {hasQuery && (
            <button
              type="button"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              aria-label={t('clearLabel')}
              className="absolute inset-y-0 right-1 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable results body */}
      <div className="flex-1 overflow-y-auto">
        <SearchContent query={query} onNavigate={onClose} visible={open} />
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
