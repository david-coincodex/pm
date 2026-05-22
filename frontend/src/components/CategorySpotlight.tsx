import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { getCategoryWithSites, strapiMediaUrl } from '@/lib/strapi';
import Container from '@/components/Container';
import { routes } from '@/lib/routes';

type SpotlightTheme = 'purple' | 'cyan';

const themes: Record<SpotlightTheme, {
  section: string;
  orb1: string;
  orb2: string;
  badge: string;
  button: string;
  cardHover: string;
  discountBadge: string;
  accentText: string;
}> = {
  purple: {
    section: 'bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900',
    orb1: 'bg-purple-600/20',
    orb2: 'bg-fuchsia-700/15',
    badge: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
    button: 'bg-purple-600 shadow-purple-900/40 hover:bg-purple-500 focus-visible:outline-purple-400',
    cardHover: 'hover:border-purple-400/50',
    discountBadge: 'bg-fuchsia-600',
    accentText: 'text-fuchsia-400',
  },
  cyan: {
    section: 'bg-gradient-to-br from-slate-900 via-cyan-950 to-slate-900',
    orb1: 'bg-cyan-500/20',
    orb2: 'bg-teal-600/15',
    badge: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
    button: 'bg-cyan-600 shadow-cyan-900/40 hover:bg-cyan-500 focus-visible:outline-cyan-400',
    cardHover: 'hover:border-cyan-400/50',
    discountBadge: 'bg-teal-500',
    accentText: 'text-cyan-400',
  },
};

interface CategorySpotlightProps {
  categorySlug: string;
  theme?: SpotlightTheme;
}

export default async function CategorySpotlight({ categorySlug, theme = 'purple' }: CategorySpotlightProps) {
  const t = await getTranslations('categorySpotlight');
  const category = await getCategoryWithSites(categorySlug, 3).catch(() => null);

  if (!category || category.sites.length === 0) return null;

  const c = themes[theme];

  return (
    <section className={`relative overflow-hidden ${c.section} py-14`}>
      {/* Decorative orbs */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full ${c.orb1} blur-3xl`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full ${c.orb2} blur-3xl`}
      />

      <Container>
        <div className="relative flex flex-col gap-10 lg:flex-row lg:items-center">
          {/* Left: category info */}
          <div className="flex flex-col gap-5 lg:w-2/5">
            <div>
              <span className={`mb-3 inline-block rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest ${c.badge}`}>
                {t('badge')}
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
                className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-lg transition focus-visible:outline focus-visible:outline-2 ${c.button}`}
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
              const discountPercent =
                bestOffer?.full_price && bestOffer.full_price > bestOffer.price
                  ? Math.round(((bestOffer.full_price - bestOffer.price) / bestOffer.full_price) * 100)
                  : null;
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
                        -{discountPercent}%
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
