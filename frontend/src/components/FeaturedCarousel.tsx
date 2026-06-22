import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { routes } from '@/lib/routes';

export interface FeaturedItem {
  name: string;
  site: {
    name: string;
    slug: string;
    short_description: string | null;
    coverUrl: string | null;
    coverAlt: string | null;
    coverWidth: number;
    coverHeight: number;
  };
  bestPrice?: number;
  currency: string;
  bestOfferId?: number;
  discountPercent?: number;
}

interface FeaturedCarouselProps {
  items: FeaturedItem[];
  locale?: string;
}

export default async function FeaturedCarousel({ items, locale = 'en' }: FeaturedCarouselProps) {
  const t = await getTranslations({ locale, namespace: 'featured' });

  if (items.length === 0) return null;

  const displayItems = items.slice(0, 3);

  return (
    <section className="w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <span className="inline-block rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-400">
            {t('eyebrow')}
          </span>
          <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">{t('title')}</h2>
          <p className="mt-2 max-w-xl text-slate-400">{t('subtitle')}</p>
        </div>

        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {displayItems.map((item, i) => (
            <Link
              key={i}
              href={routes.site(item.site.slug)}
              className="group flex-none w-[82vw] snap-start overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 transition-colors hover:border-emerald-500 sm:w-[44vw] lg:flex-1 lg:w-auto"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-slate-700">
                {item.site.coverUrl ? (
                  <Image
                    src={item.site.coverUrl}
                    alt={item.site.coverAlt ?? item.site.name}
                    width={item.site.coverWidth}
                    height={item.site.coverHeight}
                    className="h-full w-full object-cover"
                    priority={i === 0}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                {item.discountPercent !== undefined && (
                  <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-3 py-1 text-sm font-bold text-white shadow">
                    {item.discountPercent}%
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-white">{item.site.name}</h3>
                {item.site.short_description && (
                  <p className="mt-1 text-sm text-slate-400 line-clamp-2">{item.site.short_description}</p>
                )}
                {item.bestPrice !== undefined && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">{t('from')}</span>
                    <span className="text-base font-bold text-emerald-400">
                      {item.currency} {item.bestPrice.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
