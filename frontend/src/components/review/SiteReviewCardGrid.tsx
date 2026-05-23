import { getTranslations } from 'next-intl/server';
import { Review } from '@/lib/strapi';
import SiteReviewCard from './SiteReviewCard';

interface SiteReviewCardGridProps {
  reviews: Review[];
  emptyMessage?: string;
}

export default async function SiteReviewCardGrid({ reviews, emptyMessage }: SiteReviewCardGridProps) {
  const t = await getTranslations('reviews');
  const message = emptyMessage ?? t('empty');

  if (reviews.length === 0) {
    return <p className="text-slate-500 dark:text-slate-400">{message}</p>;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {reviews.map((review) => (
        <SiteReviewCard key={review.id} review={review} />
      ))}
    </div>
  );
}
