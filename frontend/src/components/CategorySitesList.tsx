'use client';

import React, { useState, useTransition, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { loadCategorySites } from '@/app/actions/load-category-sites';

interface Props {
  categorySlug: string;
  /** Total sites in the category (from page 1's pagination meta). */
  total: number;
  /** Cards visible on first paint. */
  initialShow: number;
  /** Cards revealed per click; also the server page size. */
  pageSize: number;
  /** Page 1 of cards, rendered by the page itself so they are in the initial HTML. */
  children: ReactNode;
}

/**
 * The category page's site list: shows `initialShow` cards, and one button that
 * reveals `pageSize` more per click, fetching further server-rendered pages via
 * the loadCategorySites action as needed. Replaces the old ?page= pagination.
 *
 * Invariant that keeps this simple: `pageSize` is both the reveal step and the
 * fetch size, so a single click never needs more than one fetch.
 */
export default function CategorySitesList({ categorySlug, total, initialShow, pageSize, children }: Props) {
  const t = useTranslations('richText');
  const [shown, setShown] = useState(initialShow);
  const [extra, setExtra] = useState<ReactNode[]>([]);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const initial = React.Children.toArray(children);
  const loaded = initial.length + extra.length;
  const visible = [...initial, ...extra].slice(0, shown);
  const remaining = Math.max(0, total - Math.min(shown, total));

  const showMore = () => {
    startTransition(async () => {
      const nextShown = Math.min(shown + pageSize, total);
      try {
        if (nextShown > loaded && loaded < total) {
          const { nodes } = await loadCategorySites(categorySlug, Math.floor(loaded / pageSize) + 1);
          setExtra((prev) => [...prev, ...nodes]);
        }
        setFailed(false);
        setShown(nextShown);
      } catch {
        // Leave `shown` untouched so the button stays and the click can be retried.
        setFailed(true);
      }
    });
  };

  return (
    <div className="not-prose mt-4 mb-10">
      {visible}
      {remaining > 0 && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={showMore}
            disabled={isPending}
            className="cursor-pointer rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700"
          >
            {t('showMore', { count: Math.min(pageSize, remaining) })}
          </button>
          {failed && <p className="text-xs text-red-500">{t('showMoreError')}</p>}
        </div>
      )}
    </div>
  );
}
