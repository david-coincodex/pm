import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { Site, strapiMediaUrl, getActiveSale, getDiscountPercent } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import SaleBadgeOverlay from '@/components/sale/SaleBadgeOverlay';

interface SiteCardInlineProps {
  site: Site;
}

function scoreColor(score: number): string {
  if (score >= 8) return 'bg-emerald-600';
  if (score >= 6) return 'bg-amber-500';
  return 'bg-red-500';
}

export default async function SiteCardInline({ site }: SiteCardInlineProps) {
  const [t, activeSale] = await Promise.all([
    getTranslations('discount'),
    getActiveSale(),
  ]);

  const image = site.cover_image ?? site.logo;
  const saleBadge = activeSale?.siteIds.includes(site.id) ? activeSale : null;

  // Best active offer by discount %
  const activeOffers = (site.offers ?? []).filter((o) => o.isActive);
  const bestOffer = activeOffers.length
    ? activeOffers.reduce((best, o) => {
        const d = getDiscountPercent(o) ?? 0;
        const bd = getDiscountPercent(best) ?? 0;
        return d > bd ? o : best;
      }, activeOffers[0])
    : null;

  const bestPrice = bestOffer?.price;
  const bestFullPrice = bestOffer?.full_price ?? undefined;
  const discountPercent = bestOffer ? (getDiscountPercent(bestOffer) ?? undefined) : undefined;
  const href = routes.site(site.slug);

  return (
    <article className="not-prose group my-4 flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
      {/* Cover image — left side */}
      <Link href={href} className="relative w-36 shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-700 sm:w-48">
        {image ? (
          <Image
            src={strapiMediaUrl(image)}
            alt={image.alternativeText ?? site.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 144px, 192px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400 dark:text-slate-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* Discount badge */}
        {discountPercent !== undefined && (
          <span className="absolute right-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
            {discountPercent}%
          </span>
        )}
        {/* Sale badge */}
        {saleBadge ? (
          <SaleBadgeOverlay
            badgeImage={saleBadge.badgeImage}
            badgeLabel={saleBadge.badgeLabel}
            badgeIcon={saleBadge.badgeIcon}
            themeColor={saleBadge.themeColor}
          />
        ) : (site.siteType === 'camsite' && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-slate-500 shadow-sm backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
            {t('liveBadge')}
          </span>
        ))}
      </Link>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
        <Link
          href={href}
          className="text-base font-semibold text-slate-900 hover:underline dark:text-white"
        >
          {site.name}
        </Link>

        {site.short_description && (
          <p className="line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {site.short_description}
          </p>
        )}

        {/* Price row */}
        <div className="mt-1 flex items-center gap-1.5">
          {bestPrice !== undefined ? (
            <>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('from')}</span>
              {bestFullPrice !== undefined && bestFullPrice > bestPrice && (
                <span className="text-xs text-slate-400 line-through dark:text-slate-500">
                  ${bestFullPrice.toFixed(2)}
                </span>
              )}
              <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                ${bestPrice.toFixed(2)}
              </span>
            </>
          ) : (
            <span className="text-sm text-slate-400 dark:text-slate-500">&nbsp;</span>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-auto flex gap-2 pt-2">
          <Link
            href={href}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700"
          >
            {t('viewDeal')}
          </Link>
          {bestOffer ? (
            <Link
              href={routes.offer(bestOffer.id)}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-600"
            >
              {site.siteType === 'camsite' ? t('getCredits') : t('buyNow')}
            </Link>
          ) : (
            <Link
              href={href}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-600"
            >
              {site.siteType === 'camsite' ? t('getCredits') : t('buyNow')}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
