import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getCategoryBySlug, getSitesByCategorySlug } from '@/lib/strapi';
import { localizedAlternates } from '@/lib/pagination';
import { routes } from '@/lib/routes';
import Container from '@/components/Container';
import SidebarLayout from '@/components/SidebarLayout';
import SectionTitle from '@/components/SectionTitle';
import SiteCardInline from '@/components/rich-text/SiteCardInline';
import CategorySitesList from '@/components/CategorySitesList';
import RichText from '@/components/RichText';
import Breadcrumbs from '@/components/Breadcrumbs';
import SidebarFeaturedSites from '@/components/SidebarFeaturedSites';
import SidebarCategorySites from '@/components/SidebarCategorySites';
import CategoryGrid from '@/components/CategoryGrid';
import FaqSection from '@/components/FaqSection';

/** Extract category slug from a URL slug like "best-ai-porn-sites" → "ai-porn" */
function parseCategorySlug(slug: string): string | null {
  const m = slug.match(/^best-(.+)-sites$/);
  return m ? m[1] : null;
}

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;

  const categorySlug = parseCategorySlug(slug);
  if (!categorySlug) return {};

  const [category, t] = await Promise.all([
    getCategoryBySlug(categorySlug).catch(() => null),
    getTranslations({ locale, namespace: 'pageSEO' }),
  ]);
  if (!category) return {};
  const categoryPath = routes.category(categorySlug);
  // The list grows in place via "show more" — there are no ?page= URLs any more, so any
  // legacy /best-x-sites/?page=N that search engines still hold canonicalises to the base path.
  return {
    title: t('category.metaTitle', { name: category.name }),
    description: category.description ?? undefined,
    alternates: localizedAlternates(categoryPath, locale),
  };
}

export default async function CategoryPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const categorySlug = parseCategorySlug(slug);
  if (!categorySlug) notFound();

  const PAGE_SIZE = 12;

  // Guard the Strapi fetches: a backend error/timeout for this category must degrade gracefully
  // (empty sites, or notFound if the category itself can't load) rather than crash the page (500).
  const [category, { sites, pagination }, t] = await Promise.all([
    getCategoryBySlug(categorySlug).catch(() => null),
    getSitesByCategorySlug(categorySlug, 1, PAGE_SIZE).catch(() => ({
      sites: [],
      pagination: { page: 1, pageSize: PAGE_SIZE, pageCount: 1, total: 0 },
    })),
    getTranslations({ locale, namespace: 'pageSEO' }),
  ]);

  if (!category) notFound();

  return (
    <>
      <Breadcrumbs locale={locale} crumbs={[
        { label: category.name, href: routes.category(categorySlug) },
      ]} />
      <Container padded={false} className="pt-6 lg:pt-12">
        <SidebarLayout
          reversed
          sidebar={
            <div className="flex flex-col gap-8">
              <SidebarFeaturedSites />
              <SidebarCategorySites categoryId={3} limit={3} />
            </div>
          }
          header={
            <SectionTitle
              as="h1"
              title={t('category.pageTitle', { name: category.name })}
              subtitle={category.description ?? t('category.pageSubtitle', { name: category.name })}
            />
          }
        >
          {category.intro && <RichText content={category.intro} locale={locale} />}
          <CategorySitesList
            categorySlug={categorySlug}
            total={pagination.total}
            initialShow={5}
            pageSize={PAGE_SIZE}
          >
            {sites.map((site) => (
              <SiteCardInline key={site.id} site={site} />
            ))}
          </CategorySitesList>
          {category.content && <RichText content={category.content} locale={locale} />}
        </SidebarLayout>
      </Container>
      <CategoryGrid />
      <FaqSection faqs={category.faqs} />
    </>
  );
}
