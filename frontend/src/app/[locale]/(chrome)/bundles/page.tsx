import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { getBundlesPaginated } from '@/lib/strapi';
import Container from '@/components/Container';
import BundleGrid from '@/components/bundle/BundleGrid';
import Pagination from '@/components/Pagination';
import SectionTitle from '@/components/SectionTitle';

const PAGE_SIZE = 12;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

function parsePage(s: string | undefined) {
  const n = parseInt(s ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'bundles' });
  const canonical = locale === routing.defaultLocale ? '/bundles/' : `/${locale}/bundles/`;

  return {
    title: t('pageTitle'),
    description: t('pageSubtitle'),
    alternates: {
      canonical,
      languages: Object.fromEntries(
        routing.locales.map((loc) => [
          loc,
          loc === routing.defaultLocale ? '/bundles/' : `/${loc}/bundles/`,
        ])
      ),
    },
  };
}

export default async function BundlesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const page = parsePage(pageStr);
  const basePath = locale === routing.defaultLocale ? '/bundles/' : `/${locale}/bundles/`;

  const [{ bundles, pagination }, t] = await Promise.all([
    getBundlesPaginated(page, PAGE_SIZE).catch(() => ({
      bundles: [],
      pagination: { page: 1, pageSize: PAGE_SIZE, pageCount: 1, total: 0 },
    })),
    getTranslations({ locale, namespace: 'bundles' }),
  ]);

  const prevHref = page > 1 ? (page === 2 ? basePath : `${basePath}?page=${page - 1}`) : null;
  const nextHref = page < pagination.pageCount ? `${basePath}?page=${page + 1}` : null;

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
