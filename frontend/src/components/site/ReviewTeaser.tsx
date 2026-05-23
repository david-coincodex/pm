'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { routes } from '@/lib/routes';

interface ReviewTeaserProps {
  slug: string;
  score: number | null;
}

export default function ReviewTeaser({ slug, score }: ReviewTeaserProps) {
  const t = useTranslations('discount');

  return (
    <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {t('ourReview')}
        </span>
        <div className="flex items-center gap-3">
          {score !== null && (
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-sm font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd" />
              </svg>
              {score.toFixed(1)}
            </span>
          )}
          <Link
            href={routes.review(slug)}
            className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          >
            {t('readReview')} →
          </Link>
        </div>
      </div>
    </div>
  );
}
