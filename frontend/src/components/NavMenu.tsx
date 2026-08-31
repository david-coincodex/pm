'use client';

import { useState, useSyncExternalStore, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import SearchBar from './SearchBar';
import LanguageSwitcher from './LanguageSwitcher';
import MobileSearchOverlay from './MobileSearchOverlay';
import ThemeToggle from './ThemeToggle';
import HeartIcon from '@/components/HeartIcon';
import { routes } from '@/lib/routes';
import { siteSettings } from '@/lib/siteSettings';

const subscribeNever = () => () => {};

/** Small emerald "NEW" tag next to a nav item, so a just-launched feature stands out. */
function NewBadge({ children }: { children: ReactNode }) {
  return (
    <span className="ml-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white align-middle">
      {children}
    </span>
  );
}

function NavLink({ href, label, onClick, badge }: { href: string; label: string; onClick?: () => void; badge?: string }) {
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
      {badge && <NewBadge>{badge}</NewBadge>}
    </Link>
  );
}

export default function NavMenu({ activeSale }: { activeSale?: { slug: string; navLabel: string; themeColor: string } | null }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations('nav');

  // "Am I hydrated?" via the store hook: the server snapshot says no, the client re-reads
  // once after hydration — no effect-driven setState, no cascading render.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  // Close drawer/search on navigation. Adjusting state during render (React's documented
  // pattern for state derived from a changing value) rather than in an effect: no second
  // render pass, and the drawer is never briefly visible over the new page.
  const [renderedPath, setRenderedPath] = useState(pathname);
  if (pathname !== renderedPath) {
    setRenderedPath(pathname);
    setDrawerOpen(false);
    setSearchOpen(false);
  }

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
          {siteSettings.features.bundles && <NavLink href={routes.bundles()} label={t('bundles')} />}
          <NavLink href={routes.liveSexNav()} label={t('liveSex')} badge={t('new')} />
          <NavLink href={routes.reviews()} label={t('reviews')} />
          <NavLink href={routes.categories()} label={t('categories')} />
          <NavLink href={routes.blog()} label={t('blog')} />
          {activeSale && (
            <Link
              href={routes.sale(activeSale.slug)}
              className="rounded-full px-3 py-1 text-sm font-bold text-white transition hover:opacity-90"
              style={{ backgroundColor: activeSale.themeColor }}
            >
              {activeSale.navLabel}
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <SearchBar className="w-80" />
          {siteSettings.features.liveSex && siteSettings.features.accounts && (
            <Link
              href={routes.favorites()}
              aria-label={t('myFavorites')}
              className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <HeartIcon className="h-5 w-5" />
            </Link>
          )}
          <ThemeToggle />
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
          {([
            { href: routes.home(), label: t('pornDeals') },
            ...(siteSettings.features.bundles ? [{ href: routes.bundles(), label: t('bundles') }] : []),
            { href: routes.liveSexNav(), label: t('liveSex'), badge: t('new') },
            { href: routes.reviews(), label: t('reviews') },
            { href: routes.categories(), label: t('categories') },
            { href: routes.blog(), label: t('blog') },
          ] as { href: string; label: string; badge?: string }[]).map(({ href, label, badge }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setDrawerOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {label}
              {badge && <NewBadge>{badge}</NewBadge>}
            </Link>
          ))}
          {activeSale && (
            <Link
              href={routes.sale(activeSale.slug)}
              onClick={() => setDrawerOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-bold text-white transition-colors"
              style={{ backgroundColor: activeSale.themeColor }}
            >
              {activeSale.navLabel}
            </Link>
          )}
        </nav>

        {siteSettings.features.liveSex && siteSettings.features.accounts && (
          <div className="shrink-0 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
            <Link
              href={routes.favorites()}
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <HeartIcon className="h-4 w-4" />
              {t('myFavorites')}
            </Link>
          </div>
        )}
        {/* Drawer footer: theme toggle + language switcher */}
        <div className="mt-auto flex shrink-0 items-center justify-between border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          <LanguageSwitcher showLabel />
          <ThemeToggle showLabel />
        </div>
      </div>
        </>,
        document.body,
      )}
    </>
  );
}
