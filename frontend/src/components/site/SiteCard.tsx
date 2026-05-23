import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { Site, strapiMediaUrl } from '@/lib/strapi';
import { routes } from '@/lib/routes';

interface SiteCardProps {
  site: Site;
  /** Best (lowest) deal price to show as a teaser */
  bestPrice?: number;
  currency?: string;
  /** ID of the best active offer, used for the Buy Now button */
  bestOfferId?: number;
  /** Discount percentage to show as a badge */
  discountPercent?: number;
  /** Review mode: shows score badge, "Read Review" button, and links to review page */
  review?: { score: number | null };
}

function scoreColor(score: number): string {
  if (score >= 8) return 'bg-emerald-600';
  if (score >= 6) return 'bg-amber-500';
  return 'bg-red-500';
}

export default async function SiteCard({ site, bestPrice, currency = 'USD', bestOfferId, discountPercent, review }: SiteCardProps) {
  const t = await getTranslations('discount');
  const tReviews = review ? await getTranslations('reviews') : null;
  const href = review ? routes.review(site.slug) : `/${site.slug}/`;
  const image = site.cover_image ?? site.logo;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
      {/* Cover image */}
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
          <div className="flex h-full items-center justify-center text-slate-400 dark:text-slate-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {!review && discountPercent !== undefined && (
          <span className="absolute right-2 top-2 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
            {discountPercent}%
          </span>
        )}
        {!review && site.siteType === 'camsite' && (
          <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
            {t('liveBadge')}
          </span>
        )}
        {review?.score !== null && review?.score !== undefined && (
          <span className={`absolute right-2 top-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-white shadow-sm ${scoreColor(review.score)}`}>
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd" />
            </svg>
            {review.score.toFixed(1)}
          </span>
        )}
      </Link>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link
          href={href}
          className="text-base font-semibold text-slate-900 hover:underline dark:text-white"
        >
          {review ? t('reviewTitle', { name: site.name }) : site.name}
        </Link>

        {site.short_description && (
          <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
            {site.short_description}
          </p>
        )}

        {!review && bestPrice !== undefined && (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">From</span>
            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
              {currency} {bestPrice.toFixed(2)}
            </span>
          </div>
        )}

        {/* Buttons */}
        <div className="mt-auto flex gap-2 pt-3">
          {review ? (
            <>
              <Link
                href={href}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700"
              >
                {tReviews!('readReview')}
              </Link>
              <Link
                href={`/${site.slug}/`}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              >
                {site.siteType === 'camsite' ? t('getCredits') : t('buyNow')}
              </Link>
            </>
          ) : (
            <>
              <Link
                href={href}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700"
              >
                {t('viewDeal')}
              </Link>
              {bestOfferId !== undefined ? (
                <Link
                  href={routes.offer(bestOfferId)}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                >
                  {site.siteType === 'camsite' ? t('getCredits') : t('buyNow')}
                </Link>
              ) : (
                <Link
                  href={href}
                  className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                >
                  {site.siteType === 'camsite' ? t('getCredits') : t('buyNow')}
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
