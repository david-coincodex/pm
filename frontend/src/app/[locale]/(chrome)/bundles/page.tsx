import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getBundlesPaginated } from '@/lib/strapi';
import { parsePage, paginatedAlternates, paginatedNavLinks, paginatedTitle } from '@/lib/pagination';
import { routes } from '@/lib/routes';
import Container from '@/components/Container';
import Breadcrumbs from '@/components/Breadcrumbs';
import BundleGrid from '@/components/bundle/BundleGrid';
import Pagination from '@/components/Pagination';
import SectionTitle from '@/components/SectionTitle';
import FaqSection from '@/components/FaqSection';

const PAGE_SIZE = 12;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'pageSEO' });
  const page = parsePage(pageStr);

  return {
    title: paginatedTitle(t('bundles.metaTitle'), page),
    description: t('bundles.pageSubtitle'),
    alternates: paginatedAlternates(routes.bundles(), page, locale),
  };
}

export default async function BundlesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const page = parsePage(pageStr);
  const basePath = routes.bundles();

  const [{ bundles, pagination }, t, tSeo, tBc] = await Promise.all([
    getBundlesPaginated(page, PAGE_SIZE).catch(() => ({
      bundles: [],
      pagination: { page: 1, pageSize: PAGE_SIZE, pageCount: 1, total: 0 },
    })),
    getTranslations({ locale, namespace: 'bundles' }),
    getTranslations({ locale, namespace: 'pageSEO' }),
    getTranslations({ locale, namespace: 'breadcrumbs' }),
  ]);

  const { prevHref, nextHref } = paginatedNavLinks(basePath, page, pagination.pageCount);

  // Static FAQ about bundles (with schema.org markup via FaqSection).
  const faqItems = (t.raw('faqItems') as { question: string; answer: string }[]).map((f, i) => ({ id: i, ...f }));

  return (
    <>
      {prevHref && <link rel="prev" href={prevHref} />}
      {nextHref && <link rel="next" href={nextHref} />}
      <Breadcrumbs locale={locale} crumbs={[{ label: tBc('bundles'), href: routes.bundles() }]} />
      <Container>
        <SectionTitle
          as="h1"
          title={tSeo('bundles.pageTitle')}
          subtitle={tSeo('bundles.pageSubtitle')}
        />
        <BundleGrid bundles={bundles} locale={locale} emptyMessage={t('empty')} />
        {pagination.pageCount > 1 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.pageCount}
            basePath={basePath}
          />
        )}
        <FaqSection bare faqs={faqItems} title={t('faqTitle')} />
      </Container>
    </>
  );
}
