import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getBundlesPaginated } from '@/lib/strapi';
import { parsePage, paginatedAlternates, paginatedNavLinks, paginatedTitle } from '@/lib/pagination';
import Container from '@/components/Container';
import BundleGrid from '@/components/bundle/BundleGrid';
import Pagination from '@/components/Pagination';
import SectionTitle from '@/components/SectionTitle';

const PAGE_SIZE = 12;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'bundles' });
  const page = parsePage(pageStr);

  return {
    title: paginatedTitle(t('pageTitle'), page),
    description: t('pageSubtitle'),
    alternates: paginatedAlternates('/bundles/', page, locale),
  };
}

export default async function BundlesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const page = parsePage(pageStr);
  const basePath = locale === 'en' ? '/bundles/' : `/${locale}/bundles/`;

  const [{ bundles, pagination }, t] = await Promise.all([
    getBundlesPaginated(page, PAGE_SIZE).catch(() => ({
      bundles: [],
      pagination: { page: 1, pageSize: PAGE_SIZE, pageCount: 1, total: 0 },
    })),
    getTranslations({ locale, namespace: 'bundles' }),
  ]);

  const { prevHref, nextHref } = paginatedNavLinks(basePath, page, pagination.pageCount);

  return (
    <>
      {prevHref && <link rel="prev" href={prevHref} />}
      {nextHref && <link rel="next" href={nextHref} />}
      <Container className="py-10">
        <SectionTitle
          as="h1"
          title={t('pageTitle')}
          subtitle={t('pageSubtitle')}
        />
        <BundleGrid bundles={bundles} locale={locale} emptyMessage={t('empty')} />
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
