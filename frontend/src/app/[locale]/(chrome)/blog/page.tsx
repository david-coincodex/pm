import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getArticlesPaginated } from '@/lib/strapi';
import { parsePage, paginatedAlternates, paginatedNavLinks, paginatedTitle } from '@/lib/pagination';
import Container from '@/components/Container';
import SectionTitle from '@/components/SectionTitle';
import Pagination from '@/components/Pagination';
import ArticleHeroGrid from '@/components/ArticleHeroGrid';

const PAGE_SIZE = 12;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'blog' });
  const page = parsePage(pageStr);

  return {
    title: paginatedTitle(t('pageTitle'), page),
    alternates: paginatedAlternates('/blog/', page, locale),
  };
}

export default async function BlogPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const page = parsePage(pageStr);

  const [{ data: articles, pagination }, t] = await Promise.all([
    getArticlesPaginated(locale, page, PAGE_SIZE),
    getTranslations({ locale, namespace: 'blog' }),
  ]);

  const blogBase = locale === 'en' ? '/blog' : `/${locale}/blog`;
  const basePath = blogBase + '/';
  const { prevHref, nextHref } = paginatedNavLinks(basePath, page, pagination.pageCount);

  return (
    <>
      {prevHref && <link rel="prev" href={prevHref} />}
      {nextHref && <link rel="next" href={nextHref} />}
      <Container className="py-10">
        <SectionTitle as="h1" title={t('pageTitle')} />

        {articles.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">{t('empty')}</p>
        ) : (
          <ArticleHeroGrid articles={articles} locale={locale} blogBase={blogBase} />
        )}

        {pagination.pageCount > 1 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.pageCount}
            basePath={basePath}
          />
        )}
      </Container>
    </>
  );
}
