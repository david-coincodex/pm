import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { getCategoryWithSites, strapiMediaUrl, getDiscountPercent } from '@/lib/strapi';
import Container from '@/components/Container';
import { routes } from '@/lib/routes';
import { themes, type SpotlightTheme } from '@/lib/themes';

export type { SpotlightTheme };

interface CategorySpotlightProps {
  categorySlug: string;
  eyebrow: string;
  theme?: SpotlightTheme;
}

export default async function CategorySpotlight({ categorySlug, eyebrow, theme = 'purple' }: CategorySpotlightProps) {
  const t = await getTranslations('categorySpotlight');
  const category = await getCategoryWithSites(categorySlug, 3).catch(() => null);

  if (!category || category.sites.length === 0) return null;

  const c = themes[theme];

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-14">
      <Container>
        <div className="relative flex flex-col gap-10 lg:flex-row lg:items-center">
          {/* Left: category info */}
          <div className="flex flex-col gap-5 lg:w-2/5">
            <div>
              <span className={`mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest ${c.badge}`}>
                {eyebrow}
              </span>
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                {category.name}
              </h2>
            </div>
            {category.description && (
              <p className="text-base leading-relaxed text-slate-300">
                {category.description}
              </p>
            )}
            <div>
              <Link
                  href={routes.category(categorySlug)}
                className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-lg transition focus-visible:outline focus-visible:outline-2 ${c.solidButton}`}
              >
                {t('viewAll', { name: category.name })}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Right: deal cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:w-3/5">
            {category.sites.map((site) => {
              const activeOffers = (site.offers ?? []).filter((o) => o.isActive);
              const sorted = [...activeOffers].sort((a, b) => a.price - b.price);
              const bestOffer = sorted[0];
              const discountPercent = bestOffer ? getDiscountPercent(bestOffer) : null;
              const image = site.cover_image ?? site.logo;

              return (
                <Link
                  key={site.id}
                  href={routes.site(site.slug)}
                  className={`group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm transition ${c.cardHover} hover:bg-white/10`}
                >
                  {/* Cover */}
                  <div className="relative aspect-video w-full overflow-hidden bg-slate-800">
                    {image ? (
                      <Image
                        src={strapiMediaUrl(image)}
                        alt={image.alternativeText ?? site.name}
                        width={image.width}
                        height={image.height}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 opacity-80"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    {discountPercent !== null && (
                      <span className={`absolute right-2 top-2 rounded-full ${c.discountBadge} px-2 py-1 text-xs font-bold text-white shadow`}>
                        {discountPercent}%
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <p className="text-sm font-semibold text-white transition-colors group-hover:text-white/80">
                      {site.name}
                    </p>
                    {bestOffer && (
                      <p className="text-xs text-slate-400">
                        {t('from')}{' '}
                        <span className={`font-bold ${c.accentText}`}>
                          ${bestOffer.price.toFixed(2)}
                        </span>
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
