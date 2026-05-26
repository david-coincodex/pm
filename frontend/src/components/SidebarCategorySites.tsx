import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { getSitesByCategoryId, getSitesBySiteType, getActiveSale, strapiMediaUrl, getDiscountPercent, type Site } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import { siteSettings } from '@/lib/siteSettings';
import SaleBadgeInline from '@/components/sale/SaleBadgeInline';

interface SidebarCategorySitesProps {
  title: string;
  limit?: number;
  categoryId?: number;
  siteType?: Site['siteType'];
}

export default async function SidebarCategorySites({ title, limit = 5, categoryId, siteType }: SidebarCategorySitesProps) {
  const sitesPromise = siteType
    ? getSitesBySiteType(siteType, limit)
    : categoryId !== undefined
      ? getSitesByCategoryId(categoryId, 1, limit).then((r) => r.sites)
      : Promise.resolve([] as Site[]);

  const [sites, activeSale, t] = await Promise.all([
    sitesPromise,
    getActiveSale(),
    getTranslations('discount'),
  ]);

  if (!Array.isArray(sites) || sites.length === 0) return null;

  const isInCamCategory = categoryId === siteSettings.CAM_CATEGORY_ID;

  return (
    <aside className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {title}
      </h2>
      <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700/60 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 overflow-hidden">
        {sites.map((site) => {
          const image = site.cover_image ?? site.logo;
          const activeOffers = (site.offers ?? []).filter((o) => o.isActive);
          const bestOffer = activeOffers.length
            ? activeOffers.reduce((best, o) => {
                const d = getDiscountPercent(o) ?? 0;
                const bd = getDiscountPercent(best) ?? 0;
                return d > bd ? o : best;
              }, activeOffers[0])
            : null;
          const discountPercent = bestOffer ? (getDiscountPercent(bestOffer) ?? undefined) : undefined;
          const bestPrice = bestOffer?.price;
          const bestFullPrice = bestOffer?.full_price ?? undefined;
          const saleBadge = activeSale?.siteIds.includes(site.id) ? activeSale : null;
          const href = routes.site(site.slug);

          return (
            <li key={site.id} className="group">
              <div className="p-3 flex flex-col gap-2.5">
                {/* Top row: thumbnail + info */}
                <div className="flex items-start gap-3">
                  <Link href={href} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
                    {image ? (
                      <Image
                        src={strapiMediaUrl(image)}
                        alt={image.alternativeText ?? site.name}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="80px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </Link>

                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    {/* Tags row above site name */}
                    <div className="flex flex-wrap items-center gap-1">
                      {discountPercent !== undefined && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                          -{discountPercent}%
                        </span>
                      )}
                      {saleBadge ? (
                        <SaleBadgeInline
                          badgeLabel={saleBadge.badgeLabel}
                          badgeIcon={saleBadge.badgeIcon}
                          themeColor={saleBadge.themeColor}
                        />
                      ) : isInCamCategory ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
                          {t('liveBadge')}
                        </span>
                      ) : null}
                    </div>

                    <Link href={href} className="text-sm font-semibold leading-snug text-slate-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-400 line-clamp-1 transition-colors">
                      {site.name}
                    </Link>

                    {site.short_description && (
                      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
                        {site.short_description}
                      </p>
                    )}

                    {/* Price row */}
                    {bestPrice !== undefined && (
                      <div className="mt-1 flex flex-wrap items-baseline gap-1 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">From</span>
                        {bestFullPrice !== undefined && bestFullPrice > bestPrice && (
                          <span className="text-slate-400 line-through dark:text-slate-500">${bestFullPrice.toFixed(2)}</span>
                        )}
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">${bestPrice.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-2">
                  <Link
                    href={href}
                    className="flex-1 rounded-lg border border-slate-200 py-1.5 text-center text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50"
                  >
                    {t('viewDeal')}
                  </Link>
                  {bestOffer ? (
                    <Link
                      href={routes.offer(bestOffer.id)}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-center text-xs font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                    >
                      {isInCamCategory ? t('getCredits') : t('buyNow')}
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
