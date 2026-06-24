import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getCategoryBySlug, getSitesByCategorySlug, getAllCategories } from '@/lib/strapi';
import { routing } from '@/i18n/routing';
import { parsePage, paginatedAlternates, paginatedNavLinks, paginatedTitle } from '@/lib/pagination';
import { routes } from '@/lib/routes';
import Container from '@/components/Container';
import SidebarLayout from '@/components/SidebarLayout';
import SectionTitle from '@/components/SectionTitle';
import SiteCardInlineList from '@/components/rich-text/SiteCardInlineList';
import Pagination from '@/components/Pagination';
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

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateStaticParams() {
  const categories = await getAllCategories().catch(() => []);
  return routing.locales.flatMap((locale) =>
    categories.map((cat) => ({ locale, slug: `best-${cat.slug}-sites` }))
  );
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const { page: pageStr } = await searchParams;

  const categorySlug = parseCategorySlug(slug);
  if (!categorySlug) return {};

  const [category, t] = await Promise.all([
    getCategoryBySlug(categorySlug).catch(() => null),
    getTranslations({ locale, namespace: 'pageSEO' }),
  ]);
  if (!category) return {};
  const page = parsePage(pageStr);
  const categoryPath = routes.category(categorySlug);
  return {
    title: paginatedTitle(t('category.metaTitle', { name: category.name }), page),
    description: category.description ?? undefined,
    alternates: paginatedAlternates(categoryPath, page, locale),
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const { page: pageStr } = await searchParams;

  const categorySlug = parseCategorySlug(slug);
  if (!categorySlug) notFound();

  const page = parsePage(pageStr);
  const PAGE_SIZE = 12;
  const basePath = routes.category(categorySlug);

  // Guard the Strapi fetches: a backend error/timeout for this category must degrade gracefully
  // (empty sites, or notFound if the category itself can't load) rather than crash the page (500).
  const [category, { sites, pagination }, t] = await Promise.all([
    getCategoryBySlug(categorySlug).catch(() => null),
    getSitesByCategorySlug(categorySlug, page, PAGE_SIZE).catch(() => ({
      sites: [],
      pagination: { page: 1, pageSize: PAGE_SIZE, pageCount: 1, total: 0 },
    })),
    getTranslations({ locale, namespace: 'pageSEO' }),
  ]);

  if (!category) notFound();

  const { prevHref, nextHref } = paginatedNavLinks(basePath, page, pagination.pageCount);

  return (
    <>
      <Breadcrumbs crumbs={[
        { label: category.name, href: routes.category(categorySlug) },
      ]} />
      {prevHref && <link rel="prev" href={prevHref} />}
      {nextHref && <link rel="next" href={nextHref} />}
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
          {category.intro && <RichText content={category.intro} />}
          <SiteCardInlineList sites={sites} initialShow={5} />
          {category.content && <RichText content={category.content} />}
          {pagination.pageCount > 1 && (
            <Pagination currentPage={pagination.page} totalPages={pagination.pageCount} basePath={basePath} />
          )}
        </SidebarLayout>
      </Container>
      <CategoryGrid />
      <FaqSection faqs={category.faqs} />
    </>
  );
}
