import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { Review, strapiMediaUrl } from '@/lib/strapi';
import { routes } from '@/lib/routes';

function overallScore(review: Review): number | null {
  const scores = review.paysiteScores ?? review.camsiteScores;
  if (!scores) return null;
  const vals = Object.entries(scores)
    .filter(([key]) => key !== 'id')
    .map(([, v]) => v)
    .filter((v): v is number => typeof v === 'number' && v !== null);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function scoreColor(score: number): string {
  if (score >= 8) return 'bg-emerald-600';
  if (score >= 6) return 'bg-amber-500';
  return 'bg-red-500';
}

interface SiteReviewCardProps {
  review: Review;
}

export default async function SiteReviewCard({ review }: SiteReviewCardProps) {
  const t = await getTranslations('reviews');
  const site = review.site;
  const image = site.cover_image ?? site.logo;
  const score = overallScore(review);
  const href = routes.review(site.slug);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
      {/* Cover */}
      <Link href={href} className="relative block aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-700">
        {image ? (
          <Image
            src={strapiMediaUrl(image)}
            alt={image.alternativeText ?? site.name}
            width={image.width}
            height={image.height}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {score !== null && (
          <span className={`absolute right-2 top-2 rounded-full px-2.5 py-1 text-xs font-bold text-white shadow-sm ${scoreColor(score)}`}>
            {score}/10
          </span>
        )}
      </Link>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {site.name}
        </p>
        <Link href={href} className="text-base font-semibold text-slate-900 hover:underline dark:text-white line-clamp-2">
          {review.title}
        </Link>
        {review.description && (
          <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-3">
            {review.description}
          </p>
        )}
        <div className="mt-auto pt-3">
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {t('readReview')}
          </Link>
        </div>
      </div>
    </article>
  );
}
