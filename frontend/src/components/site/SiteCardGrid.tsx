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
  /** When provided, the card renders in review mode */
  review?: { score: number | null };
}

interface SiteCardGridProps {
  items: SiteWithDealMeta[];
  emptyMessage?: string;
  variant?: 'light' | 'dark';
}

export default async function SiteCardGrid({ items, emptyMessage, variant }: SiteCardGridProps) {
  const t = await getTranslations('discounts');
  const message = emptyMessage ?? t('empty');

  if (items.length === 0) {
    return <p className={variant === 'dark' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}>{message}</p>;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map(({ site, bestPrice, bestFullPrice, currency, bestOfferId, discountPercent, review }) => (
        <SiteCard key={site.id} site={site} bestPrice={bestPrice} bestFullPrice={bestFullPrice} currency={currency} bestOfferId={bestOfferId} discountPercent={discountPercent} review={review} variant={variant} />
      ))}
    </div>
  );
}
