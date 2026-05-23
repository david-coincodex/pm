'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import SearchBar from './SearchBar';
import LanguageSwitcher from './LanguageSwitcher';
import MobileSearchOverlay from './MobileSearchOverlay';
import { routes } from '@/lib/routes';

const CATEGORIES = [
  { slug: 'ai-porn', name: 'AI Porn' },
  { slug: 'vr-porn', name: 'VR Porn' },
  { slug: 'premium-networks', name: 'Premium Networks' },
  { slug: 'artsy-erotic', name: 'Artsy & Erotic' },
  { slug: 'cam-sites', name: 'Cam Sites' },
];

function NavLink({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`text-sm font-medium transition-colors ${
        isActive
          ? 'text-slate-900 dark:text-white'
          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}

function CategoriesDropdown() {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        {t('categories')}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={routes.category(cat.slug)}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {cat.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NavMenu() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const t = useTranslations('nav');

  useEffect(() => { setMounted(true); }, []);

  // Close drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  // Body scroll lock when drawer is open on mobile
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  return (
    <>
      {/* ── Desktop bar ─────────────────────────────────── */}
      <div className="hidden h-16 items-center gap-6 md:flex">
        <Link href={routes.home()} className="shrink-0 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Porn<span className="text-emerald-500">Mode</span>
        </Link>

        <nav className="flex items-center gap-6">
          <NavLink href={routes.home()} label={t('pornDeals')} />
          <NavLink href={routes.bundles()} label={t('bundles')} />
          <NavLink href={routes.category('cam-sites')} label={t('liveSex')} />
          <NavLink href={routes.reviews()} label={t('reviews')} />
          <CategoriesDropdown />
          <NavLink href={routes.blog()} label={t('blog')} />
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <SearchBar className="w-80" />
          <LanguageSwitcher />
        </div>
      </div>

      {/* ── Mobile top bar ──────────────────────────────── */}
      <div className="relative flex h-14 items-center md:hidden">
        {/* Left: hamburger */}
        <button
          type="button"
          aria-label={t('openMenu')}
          onClick={() => setDrawerOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Center: logo (absolute center within this bar) */}
        <div className="absolute inset-x-0 flex justify-center pointer-events-none">
          <Link href={routes.home()} className="pointer-events-auto text-xl font-black tracking-tight text-slate-900 dark:text-white">
            Porn<span className="text-emerald-500">Mode</span>
          </Link>
        </div>

        {/* Right: search */}
        <button
          type="button"
          aria-label={t('search')}
          onClick={() => setSearchOpen(true)}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>

      {/* Mobile full-screen search overlay */}
      <MobileSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* ── Mobile drawer (portalled to body to escape header stacking context) ── */}
      {mounted && createPortal(
        <>
          <div
            className={`fixed inset-0 z-[60] bg-black/50 transition-opacity duration-300 md:hidden ${
              drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />

          <div
            className={`fixed inset-y-0 left-0 z-[70] flex w-72 flex-col bg-white shadow-xl transition-transform duration-300 ease-in-out dark:bg-slate-900 md:hidden ${
              drawerOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
        {/* Drawer header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <Link href={routes.home()} onClick={() => setDrawerOpen(false)} className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
            Porn<span className="text-emerald-500">Mode</span>
          </Link>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label={t('closeMenu')}
          >
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drawer nav links */}
        <nav className="flex flex-col overflow-y-auto px-2 py-3">
          {[
            { href: routes.home(), label: t('pornDeals') },
            { href: routes.bundles(), label: t('bundles') },
            { href: routes.category('cam-sites'), label: t('liveSex') },
            { href: routes.reviews(), label: t('reviews') },
            { href: routes.blog(), label: t('blog') },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setDrawerOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {label}
            </Link>
          ))}

          {/* Categories accordion */}
          <button
            type="button"
            onClick={() => setCatOpen((v) => !v)}
            className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t('categories')}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-3.5 w-3.5 transition-transform ${catOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <div className={`overflow-hidden transition-all duration-200 ${catOpen ? 'max-h-64' : 'max-h-0'}`}>
            <div className="ml-3 flex flex-col border-l border-slate-200 pl-2 dark:border-slate-700">
              {CATEGORIES.map((cat) => (
                <Link
                  key={cat.slug}
                  href={routes.category(cat.slug)}
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-md px-2 py-2 text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          </div>
        </nav>

        {/* Drawer footer: language switcher */}
        <div className="mt-auto shrink-0 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          <LanguageSwitcher showLabel />
        </div>
      </div>
        </>,
        document.body,
      )}
    </>
  );
}
