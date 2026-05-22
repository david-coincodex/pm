import SiteCard from './SiteCard';
import { Site } from '@/lib/strapi';
import { getTranslations } from 'next-intl/server';

interface SiteWithDealMeta {
  site: Site;
  bestPrice?: number;
  currency?: string;
  bestOfferId?: number;
  discountPercent?: number;
}

interface SiteCardGridProps {
  items: SiteWithDealMeta[];
  emptyMessage?: string;
}

export default async function SiteCardGrid({ items, emptyMessage }: SiteCardGridProps) {
  const t = await getTranslations('discounts');
  const message = emptyMessage ?? t('empty');

  if (items.length === 0) {
    return <p className="text-slate-500 dark:text-slate-400">{message}</p>;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map(({ site, bestPrice, currency, bestOfferId, discountPercent }) => (
        <SiteCard key={site.id} site={site} bestPrice={bestPrice} currency={currency} bestOfferId={bestOfferId} discountPercent={discountPercent} />
      ))}
    </div>
  );
}
