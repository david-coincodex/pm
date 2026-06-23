import SiteCard from './SiteCard';
import CardCarousel from './CardCarousel';
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
    // Mobile/tablet: snap-scroll one card per swipe (peek of the next) + dot indicator.
    // Desktop (lg+): CardCarousel's inner row becomes a CSS grid (no scroll/dots).
    <CardCarousel columns={columns} count={items.length} variant={variant}>
      {items.map(({ site, bestPrice, bestFullPrice, currency, bestOfferId, discountPercent, review }) => (
        // Mobile: ~1 card + a bit more peek  |  sm: 2 equal cards  |  lg: auto (grid takes over)
        <div
          key={site.id}
          className="w-[85%] shrink-0 snap-start sm:w-[calc(50%-0.5rem)] lg:w-auto"
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
    </CardCarousel>
  );
}
