import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getReviewsPaginated, type Review } from '@/lib/strapi';
import { parsePage, paginatedAlternates, paginatedNavLinks, paginatedTitle } from '@/lib/pagination';
import { routes } from '@/lib/routes';
import Container from '@/components/Container';
import SiteCardGrid from '@/components/site/SiteCardGrid';
import SectionTitle from '@/components/SectionTitle';
import Pagination from '@/components/Pagination';

const PAGE_SIZE = 24;

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
    title: paginatedTitle(t('reviews.metaTitle'), page),
    description: t('reviews.metaDescription'),
    alternates: paginatedAlternates(routes.reviews(), page, locale),
  };
}

export default async function ReviewsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const page = parsePage(pageStr);

  const [{ data: reviews, pagination }, t, tSeo] = await Promise.all([
    getReviewsPaginated(locale, page, PAGE_SIZE),
    getTranslations({ locale, namespace: 'reviews' }),
    getTranslations({ locale, namespace: 'pageSEO' }),
  ]);
  const reviewsWithSite = reviews.filter((review): review is Review & { site: NonNullable<Review['site']> } => Boolean(review.site));

  const basePath = routes.reviews();
  const { prevHref, nextHref } = paginatedNavLinks(basePath, page, pagination.pageCount);

  return (
    <>
      {prevHref && <link rel="prev" href={prevHref} />}
      {nextHref && <link rel="next" href={nextHref} />}
      <Container>
        <SectionTitle as="h1" title={tSeo('reviews.pageTitle')} subtitle={tSeo('reviews.pageSubtitle')} />
        <SiteCardGrid
          items={reviewsWithSite.map((review) => ({
            site: review.site,
            review: { score: review.overallScore },
          }))}
          emptyMessage={t('empty')}
        />
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
