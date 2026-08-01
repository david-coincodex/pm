import SiteCard from './SiteCard';
import { Site, Offer } from '@/lib/strapi';
import { getTranslations } from 'next-intl/server';

interface SiteWithDealMeta {
  site: Site;
  bestPrice?: number;
  bestFullPrice?: number;
  currency?: string;
  bestOfferId?: number;
  discountPercent?: number;
  /** When provided, the card renders in review mode */
  review?: { score: number | null };
  /** Whether the site is a cam site (for live badge + button label) */
  isCamSite?: boolean;
  /** Force a specific offer type — links View Deal to ?offer=<id> and shows 'Only' label */
  forcedType?: Offer['offerType'];
}

interface SiteCardGridProps {
  items: SiteWithDealMeta[];
  emptyMessage?: string;
  variant?: 'light' | 'dark';
  cols?: 2 | 3 | 4;
  /**
   * How many leading cards to treat as above-the-fold (preloaded, not lazy).
   * Defaults to 0 and should stay that way on the homepage — this grid sits below
   * the featured row, so preloading its cards would compete with the real LCP image.
   */
  priorityCount?: number;
}

export default async function SiteCardGrid({ items, emptyMessage, variant, cols = 4, priorityCount = 0 }: SiteCardGridProps) {
  const t = await getTranslations('discounts');
  const message = emptyMessage ?? t('empty');

  if (items.length === 0) {
    return <p className={variant === 'dark' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}>{message}</p>;
  }

  const gridCols =
    cols === 2 ? 'grid gap-6 sm:grid-cols-2' :
    cols === 3 ? 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3' :
    'grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return (
    <div className={gridCols}>
      {items.map(({ site, bestPrice, bestFullPrice, currency, bestOfferId, discountPercent, review, isCamSite, forcedType }, i) => (
        <SiteCard key={site.id} site={site} bestPrice={bestPrice} bestFullPrice={bestFullPrice} currency={currency} bestOfferId={bestOfferId} discountPercent={discountPercent} review={review} variant={variant} isCamSite={isCamSite} forcedType={forcedType} priority={i < priorityCount} />
      ))}
    </div>
  );
}
