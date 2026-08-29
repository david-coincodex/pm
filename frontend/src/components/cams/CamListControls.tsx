import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { camFilterUrl, type CamFilterState, type CategoryLike } from '@/lib/cams/filters';
import { siteSettings } from '@/lib/siteSettings';
import type { CamSort } from '@/lib/cams/query';
import type { ReactNode } from 'react';
import CamColsPicker from './CamColsPicker';
import CamFilterSheet from './CamFilterSheet';

interface Props {
  state: CamFilterState;
  categories: CategoryLike[];
  sort?: CamSort;
  favoritesActive?: boolean;
  /** The filter rail, server-rendered by the page — opens in the bottom sheet. */
  filters?: ReactNode;
}

/**
 * The quick controls beside a listing's title: the three views (most viewers · just went
 * live · favorites) as pill LINKS — every view is a shareable camFilterUrl page, never client
 * state (this IS the sort UI; the rail only filters) — plus the cams-per-row picker (its own
 * client island; everything else here renders on the server).
 */
/** The three views' icons — eye (same glyph as the cards' viewer count), bolt, heart. */
const VIEW_ICONS: Record<string, React.ReactNode> = {
  viewers: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1 1 0 010-.639C3.423 7.51 7.36 4.5 12 4.5s8.577 3.01 9.964 7.183a1 1 0 010 .639C20.577 16.49 16.64 19.5 12 19.5s-8.577-3.01-9.964-7.178z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  new: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  favorites: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.05l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ),
};

export default function CamListControls({ state, categories, sort = 'viewers', favoritesActive = false, filters }: Props) {
  const t = useTranslations('liveSex');

  const views = [
    { key: 'viewers', label: t('sortViewers'), href: camFilterUrl(state, categories), active: !favoritesActive && sort === 'viewers' },
    { key: 'new', label: t('sortNew'), href: camFilterUrl(state, categories, { sort: 'new' }), active: !favoritesActive && sort === 'new' },
    // The per-user view needs the account system (docs/enable-accounts.md).
    ...(siteSettings.features.accounts
      ? [{ key: 'favorites', label: t('favoritesOnly'), href: camFilterUrl(state, categories, { favorites: true }), active: favoritesActive }]
      : []),
  ];

  return (
    /* Mobile: single no-wrap row that scrolls horizontally if it overflows (scrollbar hidden);
       sm+ wraps normally. Children shrink-0 so the pills keep their size while scrolling. */
    <span className="-mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:px-0">
      {/* One connected segmented control — the joined pills read as "pick exactly one view". */}
      <span className="inline-flex shrink-0 items-center overflow-hidden rounded-full border border-slate-300 dark:border-slate-600">
        {views.map((v) => (
          <Link
            key={v.key}
            href={v.href}
            aria-current={v.active ? 'true' : undefined}
            className={`flex items-center gap-1.5 border-l border-slate-300 px-3 py-1.5 text-xs font-semibold transition first:border-l-0 dark:border-slate-600 ${
              v.active
                ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-emerald-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-emerald-400'
            }`}
          >
            {VIEW_ICONS[v.key]}
            {v.label}
          </Link>
        ))}
      </span>
      <CamColsPicker />
      {filters && <CamFilterSheet>{filters}</CamFilterSheet>}
    </span>
  );
}
