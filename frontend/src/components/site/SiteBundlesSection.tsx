import { getTranslations } from 'next-intl/server';
import type { Bundle } from '@/lib/strapi';
import BundleCard from '@/components/bundle/BundleCard';
import CardCarousel from '@/components/site/CardCarousel';
import { Link } from '@/i18n/navigation';
import { routes } from '@/lib/routes';
import { siteSettings } from '@/lib/siteSettings';

interface SiteBundlesSectionProps {
  bundles: Bundle[];
  /** true = current site is included in these bundles; false = generic discover banner */
  siteIncluded: boolean;
  siteName: string;
  locale: string;
}

export default async function SiteBundlesSection({
  bundles,
  siteIncluded,
  siteName,
  locale,
}: SiteBundlesSectionProps) {
  // Feature-flagged for launch. Guarded here rather than at call sites so every bundle section
  // (home, site pages, review pages, sale pages) disappears with the one flag.
  if (!siteSettings.features.bundles) return null;
  if (bundles.length === 0) return null;

  const t = await getTranslations({ locale, namespace: 'bundles' });

  const title = siteIncluded
    ? t('siteIncludedTitle', { siteName })
    : t('discoverTitle');

  const subtitle = siteIncluded
    ? t('siteIncludedSubtitle', { siteName })
    : t('discoverSubtitle');

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-10 lg:py-14">
      {/* Decorative orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -translate-y-24 left-1/4 h-[300px] w-[300px] rounded-full bg-orange-500/10 blur-3xl"
      />

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <span className="mb-2 inline-block text-xs font-semibold uppercase tracking-widest text-amber-400">
            {t('eyebrow')}
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            {title}
          </h2>
          <p className="mt-2 text-base text-slate-300">{subtitle}</p>
        </div>

        <CardCarousel columns={3} count={bundles.length} variant="dark" activeDotClassName="bg-amber-400">
          {bundles.map((bundle) => (
            <div
              key={bundle.id}
              className="w-[85%] shrink-0 snap-start sm:w-[calc(50%-0.5rem)] lg:w-auto"
            >
              <BundleCard bundle={bundle} locale={locale} />
            </div>
          ))}
        </CardCarousel>

        <div className="mt-8 text-center">
          <Link
            href={routes.bundles()}
            className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 px-5 py-2 text-sm font-semibold text-amber-300 transition hover:border-amber-400 hover:text-amber-200"
          >
            {t('viewAll')}
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
