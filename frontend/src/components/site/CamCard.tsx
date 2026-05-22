import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { Site, Offer, strapiMediaUrl } from '@/lib/strapi';
import { routes } from '@/lib/routes';

interface CamCardProps {
  site: Site;
  currency?: string;
}

export default async function CamCard({ site, currency = 'USD' }: CamCardProps) {
  const t = await getTranslations('cam');
  const href = `/${site.slug}/`;
  const image = site.cover_image ?? site.logo;

  const creditOffers: Offer[] = (site.offers ?? [])
    .filter((o) => o.isActive && o.offerType === 'credits')
    .sort((a, b) => a.price - b.price)
    .slice(0, 4);

  const cheapest = creditOffers[0];

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
        <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
          {t('liveBadge')}
        </span>
      </Link>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link
          href={href}
          className="text-base font-semibold text-slate-900 hover:underline dark:text-white"
        >
          {site.name}
        </Link>

        {site.short_description && (
          <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
            {site.short_description}
          </p>
        )}

        {/* Cheapest credit price */}
        {cheapest && (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('from')}</span>
            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
              {currency} {cheapest.price.toFixed(2)}
            </span>
            {cheapest.full_price && cheapest.full_price > cheapest.price && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                -{Math.round(((cheapest.full_price - cheapest.price) / cheapest.full_price) * 100)}%
              </span>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="mt-auto flex gap-2 pt-3">
          <Link
            href={href}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700"
          >
            {t('viewDeal')}
          </Link>
          {cheapest ? (
            <Link
              href={routes.offer(cheapest.id)}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              {t('getCredits')}
            </Link>
          ) : (
            <Link
              href={href}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              {t('getCredits')}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
