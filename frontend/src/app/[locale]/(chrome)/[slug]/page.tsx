import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getCategoryBySlug, getSitesByCategorySlug, getAllCategories } from '@/lib/strapi';
import { routing } from '@/i18n/routing';
import { parsePage, paginatedAlternates, paginatedNavLinks, paginatedTitle } from '@/lib/pagination';
import Container from '@/components/Container';
import SidebarLayout from '@/components/SidebarLayout';
import SectionTitle from '@/components/SectionTitle';
import SiteCardInlineList from '@/components/rich-text/SiteCardInlineList';
import Pagination from '@/components/Pagination';
import RichText from '@/components/RichText';
import BreadcrumbsSetter from '@/components/BreadcrumbsSetter';
import SidebarFeaturedSites from '@/components/SidebarFeaturedSites';
import SidebarCategorySites from '@/components/SidebarCategorySites';
import CategoryGrid from '@/components/CategoryGrid';

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
    getCategoryBySlug(categorySlug),
    getTranslations({ locale, namespace: 'category' }),
  ]);
  if (!category) return {};
  const page = parsePage(pageStr);
  return {
    title: paginatedTitle(t('pageMetaTitle', { name: category.name }), page),
    description: category.description ?? undefined,
    alternates: paginatedAlternates(`/${slug}/`, page, locale),
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const { page: pageStr } = await searchParams;

  const categorySlug = parseCategorySlug(slug);
  if (!categorySlug) notFound();

  const page = parsePage(pageStr);
  const PAGE_SIZE = 12;
  const basePath = locale === 'en' ? `/${slug}/` : `/${locale}/${slug}/`;

  const [category, { sites, pagination }, t] = await Promise.all([
    getCategoryBySlug(categorySlug),
    getSitesByCategorySlug(categorySlug, page, PAGE_SIZE),
    getTranslations({ locale, namespace: 'category' }),
  ]);

  if (!category) notFound();

  const { prevHref, nextHref } = paginatedNavLinks(basePath, page, pagination.pageCount);

  return (
    <>
      <BreadcrumbsSetter crumbs={[
        { label: category.name, href: `/${slug}/` },
      ]} />
      {prevHref && <link rel="prev" href={prevHref} />}
      {nextHref && <link rel="next" href={nextHref} />}
      <Container className="py-10">
        <SidebarLayout
          reversed
          sidebar={
            <div className="flex flex-col gap-8">
              <SidebarFeaturedSites />
              <SidebarCategorySites categoryId={3} title="Live Sex Deals" limit={3} />
            </div>
          }
          header={
            <SectionTitle
              as="h1"
              title={t('heading', { name: category.name })}
              subtitle={category.description ?? t('defaultSubtitle', { name: category.name })}
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
    </>
  );
}
