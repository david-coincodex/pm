import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getReviewsPaginated, type Review, type PaysiteScores, type CamsiteScores } from '@/lib/strapi';
import { parsePage, paginatedAlternates, paginatedNavLinks, paginatedTitle } from '@/lib/pagination';
import Container from '@/components/Container';
import SiteCardGrid from '@/components/site/SiteCardGrid';
import SectionTitle from '@/components/SectionTitle';
import Pagination from '@/components/Pagination';

const PAGE_SIZE = 12;

function computeScore(review: Review): number | null {
  const scores = review.paysiteScores ?? review.camsiteScores;
  if (!scores) return null;
  const vals = Object.entries(scores)
    .filter(([key]) => key !== 'id')
    .map(([, v]) => v)
    .filter((v): v is number => typeof v === 'number');
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'reviews' });
  const page = parsePage(pageStr);

  return {
    title: paginatedTitle(t('pageMetaTitle'), page),
    description: t('pageDescription'),
    alternates: paginatedAlternates('/reviews/', page, locale),
  };
}

export default async function ReviewsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { page: pageStr } = await searchParams;
  const page = parsePage(pageStr);

  const [{ data: reviews, pagination }, t] = await Promise.all([
    getReviewsPaginated(locale, page, PAGE_SIZE),
    getTranslations({ locale, namespace: 'reviews' }),
  ]);

  const basePath = locale === 'en' ? '/reviews/' : `/${locale}/reviews/`;
  const { prevHref, nextHref } = paginatedNavLinks(basePath, page, pagination.pageCount);

  return (
    <>
      {prevHref && <link rel="prev" href={prevHref} />}
      {nextHref && <link rel="next" href={nextHref} />}
      <Container className="py-10 lg:py-14">
        <SectionTitle as="h1" title={t('pageTitle')} subtitle={t('pageDescription')} />
        <SiteCardGrid
          items={reviews.map((review) => ({
            site: review.site,
            review: { score: computeScore(review) },
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
