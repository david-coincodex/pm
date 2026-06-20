import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import type { Bundle } from '@/lib/strapi';
import { strapiMediaUrl, getMaxDiscountPercent } from '@/lib/strapi';
import { routes } from '@/lib/routes';

interface BundleCardProps {
  bundle: Bundle;
  locale?: string;
}

export default async function BundleCard({ bundle, locale = 'en' }: BundleCardProps) {
  const t = await getTranslations({ locale, namespace: 'bundles' });

  const totalSites = (bundle.sites ?? []).length;
  // Up to 4 site cover images (logo fallback); skip sites without any image — no placeholders.
  const coverImages = (bundle.sites ?? [])
    .map((s) => ({ name: s.name, image: s.cover_image ?? s.logo }))
    .filter((s) => s.image)
    .slice(0, 4);
  const n = coverImages.length;

  // Only use bundle's own direct offers
  const bundleActiveOffers = (bundle.offers ?? []).filter((o) => o.isActive);
  const bestOffer = bundleActiveOffers.length > 0
    ? [...bundleActiveOffers].sort((a, b) => a.price - b.price)[0]
    : null;
  const bundleDiscount = getMaxDiscountPercent(bundleActiveOffers);

  return (
    <Link
      href={routes.bundle(bundle.slug)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
    >
      {/* Site cover images — adaptive layout, no placeholders.
          1: one full · 2: two full-height columns · 3: one tall + two stacked · 4: 2×2 grid */}
      {n > 0 && (
        <div
          className={`relative grid aspect-[16/10] w-full gap-px overflow-hidden bg-slate-200 dark:bg-slate-700 ${
            n === 1 ? 'grid-cols-1' : n === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'
          }`}
        >
          {bundleDiscount != null && (
            <span className="absolute right-2 top-2 z-10 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
              {bundleDiscount}%
            </span>
          )}
          {coverImages.map((s, i) => (
            <div
              key={i}
              className={`relative overflow-hidden bg-slate-100 dark:bg-slate-900 ${
                n === 3 && i === 0 ? 'row-span-2' : ''
              }`}
            >
              <Image
                src={strapiMediaUrl(s.image!)}
                alt={s.image!.alternativeText ?? s.name}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover opacity-90 transition-transform duration-300 group-hover:scale-105"
              />
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-slate-900 group-hover:underline dark:text-white">{bundle.name}</h3>
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {totalSites} {t('sites')}
            </span>
          </div>
          {bundle.description && (
            <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
              {bundle.description}
            </p>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between">
          {bestOffer ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400">{t('from')}</span>
              {bestOffer.full_price != null && bestOffer.full_price > bestOffer.price && (
                <span className="text-xs text-slate-500 line-through dark:text-slate-400">
                  ${bestOffer.full_price.toFixed(2)}
                </span>
              )}
              <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                ${bestOffer.price.toFixed(2)}
              </span>
            </div>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 group-hover:text-amber-500 dark:text-amber-400">
            {t('viewBundle')}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
