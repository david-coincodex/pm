'use server';

import type { ReactNode } from 'react';
import { getSitesByCategorySlug } from '@/lib/strapi';
import SiteCardInline from '@/components/rich-text/SiteCardInline';

const PAGE_SIZE = 12;

/**
 * Load one more page of a category's site cards, rendered server-side.
 *
 * Returns JSX rather than JSON because SiteCardInline is an async server component
 * (server translations + getActiveSale) — rendering it here means the category page's
 * "show more" ships no duplicate client card component and no hidden card payload.
 * The client list (CategorySitesList) just appends the returned nodes.
 *
 * Server actions are publicly callable endpoints, so inputs are clamped even though
 * the data itself is public.
 */
export async function loadCategorySites(
  categorySlug: string,
  page: number,
): Promise<{ nodes: ReactNode[]; total: number }> {
  const safeSlug = String(categorySlug).slice(0, 100);
  const safePage = Math.min(Math.max(Math.trunc(Number(page) || 1), 1), 200);

  const { sites, pagination } = await getSitesByCategorySlug(safeSlug, safePage, PAGE_SIZE);
  return {
    nodes: sites.map((site) => <SiteCardInline key={site.id} site={site} />),
    total: pagination.total,
  };
}
