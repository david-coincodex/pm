import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getBundleBySlug, getAllBundleSlugs, strapiMediaUrl } from '@/lib/strapi';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import Container from '@/components/Container';
import { routes } from '@/lib/routes';
import { localizedAlternates } from '@/lib/pagination';
import SidebarLayout from '@/components/SidebarLayout';
import DealBuy from '@/components/site/DealBuy';
import RichText from '@/components/RichText';
import Breadcrumbs from '@/components/Breadcrumbs';

type Props = { params: Promise<{ locale: string; slug: string }> };

// Render dynamically to avoid DYNAMIC_SERVER_USAGE from static generation hitting
// request-dynamic APIs.
export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  const slugs = await getAllBundleSlugs().catch(() => []);
  return routing.locales.flatMap((locale) =>
    slugs.map((slug) => ({ locale, slug }))
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const bundle = await getBundleBySlug(slug, locale).catch(() => null);
  if (!bundle) return {};
  const t = await getTranslations({ locale, namespace: 'pageSEO' });
  const bundlePath = routes.bundle(bundle.slug);

  return {
    title: t('bundles.detailMetaTitle', { name: bundle.name }),
    description: bundle.description ?? undefined,
    alternates: localizedAlternates(bundlePath, locale),
  };
}

export default async function BundleDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  // Guard the Strapi fetch: a backend error/timeout must degrade to notFound (404), not crash (500).
  const [bundle, t, dt, tBc] = await Promise.all([
    getBundleBySlug(slug, locale).catch(() => null),
    getTranslations({ locale, namespace: 'bundles' }),
    getTranslations({ locale, namespace: 'discount' }),
    getTranslations({ locale, namespace: 'breadcrumbs' }),
  ]);

  if (!bundle) notFound();

  const activeOffers = (bundle.offers ?? [])
    .filter((o) => o.isActive)
    .sort((a, b) => a.priority - b.priority);

  const dealIncludes = (bundle.sites ?? []).map((s) => s.name).join('\n');

  return (
    <>
      <Breadcrumbs crumbs={[
        { label: tBc('bundles'), href: routes.bundles() },
        { label: bundle.name, href: routes.bundle(slug) },
      ]} />
      <Container>

      {/* Hero cover image */}
      {bundle.cover_image && (
        <div className="mb-8 overflow-hidden rounded-2xl">
          <Image
            src={strapiMediaUrl(bundle.cover_image)}
            alt={bundle.cover_image.alternativeText ?? bundle.name}
            width={bundle.cover_image.width}
            height={bundle.cover_image.height}
            className="w-full object-cover"
            priority
          />
        </div>
      )}

      <SidebarLayout
        sidebar={
          <DealBuy
            offers={activeOffers}
            dealIncludes={dealIncludes}
          />
        }
      >
        {/* Bundle header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {bundle.name}
          </h1>
          {bundle.description && (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {bundle.description}
            </p>
          )}
        </div>

        {/* Included Sites */}
        <section>
          <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
            {t('includedSites')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(bundle.sites ?? []).map((site) => {
              const image = site.cover_image ?? site.logo;
              const bestOffer = (site.offers ?? [])
                .filter((o) => o.isActive)
                .sort((a, b) => a.price - b.price)[0];
              return (
                <Link
                  key={site.id}
                  href={routes.site(site.slug)}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-700">
                    {image ? (
                      <Image
                        src={strapiMediaUrl(image)}
                        alt={image.alternativeText ?? site.name}
                        width={image.width}
                        height={image.height}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400 dark:text-slate-500" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 p-4">
                    <span className="font-semibold text-slate-900 group-hover:underline dark:text-white">
                      {site.name}
                    </span>
                    {bestOffer && (
                      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        {dt('price')}: ${bestOffer.price.toFixed(2)}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Rich-text content */}
        {bundle.content && (
          <RichText content={bundle.content} className="mt-8" />
        )}

        {/* What's included */}
        {bundle.included && (
          <div className="mt-8">
            <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
              {t('whatsIncluded')}
            </h2>
            <ul className="space-y-2">
              {bundle.included.split('\n').map((item) => item.trim()).filter(Boolean).map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </SidebarLayout>
    </Container>
    </>
  );
}
