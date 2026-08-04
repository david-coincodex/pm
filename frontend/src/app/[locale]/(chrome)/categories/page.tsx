import Image from 'next/image';
import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { getCategoriesGrid, strapiMediaUrl } from '@/lib/strapi';
import Container from '@/components/Container';
import Breadcrumbs from '@/components/Breadcrumbs';
import SectionTitle from '@/components/SectionTitle';
import { localizedAlternates } from '@/lib/pagination';
import { routes } from '@/lib/routes';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pageSEO' });

  return {
    title: t('categories.metaTitle'),
    description: t('categories.metaDescription'),
    alternates: localizedAlternates(routes.categories(), locale),
  };
}

export default async function CategoriesPage({ params }: Props) {
  const { locale } = await params;
  const [t, tBc, categories] = await Promise.all([
    getTranslations({ locale, namespace: 'categoryGrid' }),
    getTranslations({ locale, namespace: 'breadcrumbs' }),
    getCategoriesGrid().catch(() => []),
  ]);

  return (
    <main>
      <Breadcrumbs locale={locale} crumbs={[{ label: tBc('categories'), href: routes.categories() }]} />
      <section>
        <Container>
          <SectionTitle as="h1" title={t('allCategories') || 'All Porn Categories'} />

          {/* Grid */}
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => {
              const href = routes.category(category.slug);
              const imgSrc = category.cover_image
                ? strapiMediaUrl(category.cover_image)
                : null;

              return (
                <li key={category.documentId}>
                  <Link
                    href={href}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
                  >
                    {/* Cover image */}
                    <div className="relative aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-700">
                      {imgSrc ? (
                        <Image
                          src={imgSrc}
                          alt={category.cover_image?.alternativeText ?? category.name}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600">
                          <span className="text-3xl font-black text-slate-400 dark:text-slate-500 select-none">
                            {category.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex flex-col gap-0.5 px-3 py-3">
                      <span className="line-clamp-1 text-sm font-semibold text-slate-900 group-hover:text-emerald-600 dark:text-white dark:group-hover:text-emerald-400 transition-colors">
                        {category.name}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {t('sites', { count: category.siteCount })}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>
    </main>
  );
}
