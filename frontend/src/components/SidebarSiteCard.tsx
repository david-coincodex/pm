import Image from 'next/image';
import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { strapiMediaUrl, getDiscountPercent, type Site } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import OfferLink from '@/components/offer/OfferLink';
import SaleBadgeInline from '@/components/sale/SaleBadgeInline';

/** Exactly the fields the badge renders — structurally satisfied by getActiveSale(). */
type SaleBadge = ComponentProps<typeof SaleBadgeInline>;

interface Props {
  site: Site;
  /** The running sale when this site takes part in it. */
  saleBadge?: SaleBadge | null;
  /** Cam sites show the pulsing LIVE tag and a "Get credits" CTA instead of "Buy now". */
  liveBadge?: boolean;
  /** 'row' (deals column): thumbnail beside the text. 'stacked' (narrow tall rails, e.g. the
   * model page): full-width image on top, then badges, title, text, price, buttons. */
  layout?: 'row' | 'stacked';
}

/**
 * THE sidebar site card — cover, badges, name, blurb, price row, View deal / buy CTAs —
 * extracted from SidebarCategorySites so single-site surfaces (the cam model page's offer)
 * render the exact same card instead of a drifting copy. Rendered inside the caller's
 * bordered <ul>; this component is one <li>.
 */
export default async function SidebarSiteCard({ site, saleBadge = null, liveBadge = false, layout = 'row' }: Props) {
  const t = await getTranslations('discount');
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
  const href = routes.site(site.slug);

  const badges = (
    <div className="flex flex-wrap items-center gap-1">
      {discountPercent !== undefined && (
        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
          {discountPercent}%
        </span>
      )}
      {saleBadge ? (
        <SaleBadgeInline badgeLabel={saleBadge.badgeLabel} badgeIcon={saleBadge.badgeIcon} themeColor={saleBadge.themeColor} />
      ) : liveBadge ? (
        <span className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:border-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
          {t('liveBadge')}
        </span>
      ) : null}
    </div>
  );

  const nameLink = (
    <Link href={href} className="text-sm font-semibold leading-snug text-slate-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-400 line-clamp-1 transition-colors">
      {site.name}
    </Link>
  );

  const description = site.short_description ? (
    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
      {site.short_description}
    </p>
  ) : null;

  const priceRow =
    bestPrice !== undefined ? (
      <div className="mt-1 flex flex-wrap items-baseline gap-1 text-xs">
        <span className="text-slate-500 dark:text-slate-400">{t('from')}</span>
        {bestFullPrice !== undefined && bestFullPrice > bestPrice && (
          <span className="text-slate-500 line-through dark:text-slate-400">${bestFullPrice.toFixed(2)}</span>
        )}
        <span className="font-bold text-emerald-600 dark:text-emerald-400">
          {bestPrice === 0 ? t('free') : `$${bestPrice.toFixed(2)}`}
        </span>
      </div>
    ) : null;

  const cover = (cls: string, sizes: string) => (
    <Link href={href} className={cls}>
      {image ? (
        <Image
          src={strapiMediaUrl(image)}
          alt={image.alternativeText ?? site.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes={sizes}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-600">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}
    </Link>
  );

  return (
    <li className="group">
      <div className="p-3 flex flex-col gap-2.5">
        {layout === 'stacked' ? (
          <>
            {/* Full-width cover on top, everything else stacked below. */}
            {cover('relative hidden aspect-video w-full overflow-hidden rounded-lg bg-slate-100 lg:block dark:bg-slate-700', '270px')}
            {badges}
            {nameLink}
            {description}
            {priceRow}
          </>
        ) : (
          <div className="flex items-start gap-3">
            {cover('relative shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700', '80px')}
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              {badges}
              {nameLink}
              {description}
              {priceRow}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          <Link
            href={href}
            className="flex-1 rounded-lg border border-slate-200 py-1.5 text-center text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50"
          >
            {t('viewDeal')}
          </Link>
          {bestOffer ? (
            <OfferLink
              offer={{
                id: bestOffer.id,
                siteName: site.name,
                siteSlug: site.slug,
                price: bestOffer.price,
                fullPrice: bestOffer.full_price,
                offerType: bestOffer.offerType,
                offerKind: bestOffer.offerKind,
                credits: bestOffer.credits,
              }}
              className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-center text-xs font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              {liveBadge ? t('getCredits') : t('buyNow')}
            </OfferLink>
          ) : null}
        </div>
      </div>
    </li>
  );
}
