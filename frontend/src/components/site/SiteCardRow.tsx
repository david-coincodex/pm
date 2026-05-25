import SiteCard from './SiteCard';
import { Site } from '@/lib/strapi';
import { getTranslations } from 'next-intl/server';

interface SiteWithDealMeta {
  site: Site;
  bestPrice?: number;
  bestFullPrice?: number;
  currency?: string;
  bestOfferId?: number;
  discountPercent?: number;
  review?: { score: number | null };
}

interface SiteCardRowProps {
  items: SiteWithDealMeta[];
  /** How many columns to display on desktop */
  columns?: number;
  emptyMessage?: string;
  variant?: 'light' | 'dark';
}

/**
 * Renders site cards in a single horizontal scrolling row.
 * - Mobile:  1 full card + peek of the next (signals scrollability)
 * - Tablet (sm): 2 full cards
 * - Desktop (lg): fixed CSS grid with `columns` equal-width columns, no scroll
 */
export default async function SiteCardRow({
  items,
  columns = 4,
  emptyMessage,
  variant,
}: SiteCardRowProps) {
  const t = await getTranslations('discounts');
  const message = emptyMessage ?? t('empty');

  if (items.length === 0) {
    return (
      <p className={variant === 'dark' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}>
        {message}
      </p>
    );
  }

  return (
    // Mobile/tablet: flex row with horizontal scroll
    // Desktop (lg+): switches to CSS grid — inline style sets column count dynamically
    <div
      className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3
                 lg:grid lg:snap-none lg:overflow-visible lg:pb-0 lg:gap-6"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {items.map(({ site, bestPrice, bestFullPrice, currency, bestOfferId, discountPercent, review }) => (
        // Mobile: 1 full card + peek  |  sm: 2 equal cards  |  lg: auto (grid takes over)
        <div
          key={site.id}
          className="w-[calc(100%-2.5rem)] shrink-0 snap-start sm:w-[calc(50%-0.5rem)] lg:w-auto"
        >
          <SiteCard
            site={site}
            bestPrice={bestPrice}
            bestFullPrice={bestFullPrice}
            currency={currency}
            bestOfferId={bestOfferId}
            discountPercent={discountPercent}
            review={review}
            variant={variant}
          />
        </div>
      ))}
    </div>
  );
}
