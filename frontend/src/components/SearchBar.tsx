'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import SearchContent from '@/components/SearchContent';

interface SearchBarProps {
  placeholder?: string;
  className?: string;
}

export default function SearchBar({
  placeholder,
  className = '',
}: SearchBarProps) {
  const t = useTranslations('search');
  const resolvedPlaceholder = placeholder ?? t('placeholder');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function closeDropdown() {
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
        </span>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={resolvedPlaceholder}
          autoComplete="off"
          className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:bg-slate-700"
        />

        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            aria-label={t('clearLabel')}
            className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className={`absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg empty:hidden dark:border-slate-700 dark:bg-slate-800 ${open ? '' : 'invisible pointer-events-none'}`}>
        <SearchContent query={query} onNavigate={closeDropdown} visible={open} />
      </div>
    </div>
  );
}
