import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import type { Bundle } from '@/lib/strapi';
import { strapiMediaUrl } from '@/lib/strapi';
import { routes } from '@/lib/routes';

interface BundleCardProps {
  bundle: Bundle;
  locale?: string;
}

export default async function BundleCard({ bundle, locale = 'en' }: BundleCardProps) {
  const t = await getTranslations({ locale, namespace: 'bundles' });

  const sites = (bundle.sites ?? []).slice(0, 4);
  const totalSites = (bundle.sites ?? []).length;

  // Only use bundle's own direct offers
  const bundleActiveOffers = (bundle.offers ?? []).filter((o) => o.isActive);
  const lowestPrice = bundleActiveOffers.length > 0
    ? Math.min(...bundleActiveOffers.map((o) => o.price))
    : Infinity;

  return (
    <Link
      href={routes.bundle(bundle.slug)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
    >
      {/* Site thumbnail strip */}
      <div className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-slate-700">
        {[0, 1, 2, 3].map((i) => {
          const site = sites[i];
          const image = site ? (site.cover_image ?? site.logo) : null;
          return (
            <div key={i} className="relative aspect-video overflow-hidden bg-slate-100 dark:bg-slate-900">
              {image ? (
                <Image
                  src={strapiMediaUrl(image)}
                  alt={image.alternativeText ?? site!.name}
                  width={image.width}
                  height={image.height}
                  className="h-full w-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-slate-400 dark:text-slate-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
          {isFinite(lowestPrice) ? (
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">{t('from')}</span>
              <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                ${lowestPrice.toFixed(2)}
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
