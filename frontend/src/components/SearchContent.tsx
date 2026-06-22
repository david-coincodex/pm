'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { type RecentItem } from '@/hooks/useRecentlyViewed';
import { type Featured, getDiscountPercent } from '@/lib/strapi';
import { type SearchResult } from '@/app/api/search/route';
import { routes } from '@/lib/routes';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function readRecentFromStorage(): RecentItem[] {
  try {
    const raw = localStorage.getItem('pm_recently_viewed');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function clearRecentStorage() {
  try {
    localStorage.removeItem('pm_recently_viewed');
  } catch {
    // ignore
  }
}

function getBestOffer(site: any) {
  const active = (site.offers ?? []).filter((o: any) => o.isActive);
  if (active.length === 0) return null;
  const sorted = [...active].sort((a: any, b: any) => a.price - b.price);
  return sorted[0];
}

function PriceTag({ price, fullPrice }: { price?: number; fullPrice?: number | null }) {
  if (price == null) return null;
  const discount = getDiscountPercent({ price, full_price: fullPrice ?? null });

  return (
    <div className="flex items-center gap-2">
      {discount && (
        <span className="rounded bg-emerald-600/10 px-1.5 py-0.5 text-xs font-bold text-emerald-600 dark:bg-emerald-600/25 dark:text-emerald-400">
          {discount}%
        </span>
      )}
      <span className="text-sm font-semibold text-slate-900 dark:text-white">
        ${price.toFixed(2)}
      </span>
      {fullPrice != null && fullPrice > price && (
        <span className="text-xs text-slate-400 line-through">${fullPrice.toFixed(2)}</span>
      )}
    </div>
  );
}

function SearchResultRow({ result, onNavigate, active }: { result: SearchResult; onNavigate: () => void; active?: boolean }) {
  const href = routes.site(result.slug);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-4 py-3 transition-colors ${active ? 'bg-slate-100 dark:bg-slate-700' : 'hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800 dark:active:bg-slate-700'}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{result.name}</p>
      </div>
      <PriceTag price={result.price} fullPrice={result.fullPrice} />
    </Link>
  );
}

function RecommendedRow({ feat, onNavigate }: { feat: Featured; onNavigate: () => void }) {
  const offer = getBestOffer(feat.site);
  return (
    <Link
      href={routes.site(feat.site.slug)}
      onClick={onNavigate}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800 dark:active:bg-slate-700"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{feat.site.name}</p>
      </div>
      {offer && <PriceTag price={offer.price} fullPrice={offer.full_price} />}
    </Link>
  );
}

function RecentRow({ item, onNavigate }: { item: RecentItem; onNavigate: () => void }) {
  return (
    <Link
      href={routes.site(item.slug)}
      onClick={onNavigate}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800 dark:active:bg-slate-700"
    >
      <p className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">{item.name}</p>
      {item.bestPrice != null && <PriceTag price={item.bestPrice} fullPrice={item.bestFullPrice} />}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pb-1 pt-5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
      {children}
    </p>
  );
}

interface SearchContentProps {
  query: string;
  onNavigate: () => void;
  activeIndex?: number;
  visible: boolean;
}

export default function SearchContent({ query, onNavigate, activeIndex = -1, visible }: SearchContentProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchedQuery, setFetchedQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [recommended, setRecommended] = useState<Featured[] | null>(null);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const t = useTranslations('search');
  const debouncedQuery = useDebounce(query, 400);

  // Re-read recently viewed every time content becomes visible
  useEffect(() => {
    if (visible) {
      setRecentItems(readRecentFromStorage());
    } else {
      setShowAll(false);
    }
  }, [visible]);

  // Fetch search results
  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults([]);
      setFetching(false);
      setFetchedQuery(debouncedQuery);
      return;
    }
    let cancelled = false;
    setFetching(true);
    setShowAll(false);
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((data: SearchResult[]) => { if (!cancelled) setResults(data); })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) { setFetching(false); setFetchedQuery(debouncedQuery); } });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  // Fetch recommended (featured deals) eagerly on mount so they're ready when dropdown opens
  useEffect(() => {
    fetch('/api/featured')
      .then((r) => r.json())
      .then((data: Featured[]) => setRecommended(data.slice(0, 3)))
      .catch(() => setRecommended([]));
  }, []);

  const hasQuery = query.trim().length > 0;
  const hasResults = results.length > 0;
  const showNoResults = hasQuery && !hasResults && !fetching && fetchedQuery === query && query.trim().length >= 2;
  const hasIdleContent = recommended !== null && (recentItems.length > 0 || recommended.length > 0);
  const hasContent = (hasQuery && (hasResults || showNoResults || fetching)) || hasIdleContent;

  if (!hasContent) return null;

  return (
    <>
      {/* Search results */}
      {hasQuery && hasResults && (
        <div>
          <SectionLabel>{t('searchResults')}</SectionLabel>
          {(showAll ? results : results.slice(0, 10)).map((result, i) => (
            <SearchResultRow key={result.id} result={result} onNavigate={onNavigate} active={i === activeIndex} />
          ))}
          {!showAll && results.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full px-4 py-3 text-center text-sm font-medium text-emerald-600 transition-colors hover:bg-slate-50 dark:text-emerald-400 dark:hover:bg-slate-800"
            >
              {t('showAllResults', { count: results.length })}
            </button>
          )}
        </div>
      )}

      {/* No results message */}
      {showNoResults && (
        <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t('noResults')}
        </p>
      )}

      {/* Recently Viewed + Recommended — only render once recommended has loaded */}
      {recommended !== null && (
        <>
          {recentItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-4 pb-1 pt-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {t('recentlyViewed')}
                </p>
                <button
                  type="button"
                  onClick={() => { clearRecentStorage(); setRecentItems([]); }}
                  className="text-xs font-medium text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {t('clearRecent')}
                </button>
              </div>
              {recentItems.map((item) => (
                <RecentRow key={item.slug} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          )}

          {/* Recommended (featured deals) */}
          {recommended.length > 0 && (
            <div>
              <SectionLabel>{t('recommended')}</SectionLabel>
              {recommended.map((feat) => (
                <RecommendedRow key={feat.id} feat={feat} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
