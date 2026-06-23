import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import {
  getAllAuthorSlugs,
  getAuthorBySlug,
  getArticlesByAuthor,
  getReviewsByAuthor,
  strapiMediaUrl,
  type Review,
} from '@/lib/strapi';

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
import { routes } from '@/lib/routes';
import { parsePage, paginatedAlternates, paginatedNavLinks, paginatedTitle } from '@/lib/pagination';
import Container from '@/components/Container';
import BreadcrumbsSetter from '@/components/BreadcrumbsSetter';
import SidebarLayout from '@/components/SidebarLayout';
import SidebarLayoutHeader from '@/components/SidebarLayoutHeader';
import ArticleCardList from '@/components/ArticleCardList';
import SectionTitle from '@/components/SectionTitle';
import SiteCardGrid from '@/components/site/SiteCardGrid';
import Pagination from '@/components/Pagination';
import SidebarFeaturedSites from '@/components/SidebarFeaturedSites';
import SidebarCategorySites from '@/components/SidebarCategorySites';

const PAGE_SIZE = 12;

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateStaticParams() {
  const slugs = await getAllAuthorSlugs().catch(() => []);
  return routing.locales.flatMap((locale) =>
    slugs.map((slug) => ({ locale, slug }))
  );
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const { page: pageStr } = await searchParams;
  const page = parsePage(pageStr);

  const [author, t] = await Promise.all([
    getAuthorBySlug(slug),
    getTranslations({ locale, namespace: 'pageSEO' }),
  ]);
  if (!author) return {};

  const title = t('blog.authorMetaTitle', { name: author.name });
  const basePath = routes.blogAuthor(slug);

  return {
    title: paginatedTitle(title, page),
    alternates: paginatedAlternates(basePath, page, locale),
  };
}

export default async function AuthorPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const { page: pageStr } = await searchParams;
  const page = parsePage(pageStr);

  const [author, t, tBc] = await Promise.all([
    getAuthorBySlug(slug),
    getTranslations({ locale, namespace: 'blog' }),
    getTranslations({ locale, namespace: 'breadcrumbs' }),
  ]);

  if (!author) notFound();

  const { data: articles, pagination } = await getArticlesByAuthor(slug, locale, page, PAGE_SIZE);
  const authorReviews = page === 1 ? await getReviewsByAuthor(slug, locale, 4) : [];

  const blogBase = routes.blog().slice(0, -1);
  const basePath = routes.blogAuthor(slug);
  const { prevHref, nextHref } = paginatedNavLinks(basePath, page, pagination.pageCount);

  return (
    <>
      {prevHref && <link rel="prev" href={prevHref} />}
      {nextHref && <link rel="next" href={nextHref} />}

      <BreadcrumbsSetter crumbs={[
        { label: tBc('blog'), href: routes.blog() },
        { label: author.name, href: routes.blogAuthor(slug) },
      ]} />

      <Container>
        <SidebarLayout
          reversed
          sidebar={
            <div className="flex flex-col gap-8">
              <SidebarFeaturedSites />
              <SidebarCategorySites categoryId={3} limit={3} />
            </div>
          }
          header={<SidebarLayoutHeader title={author.name} description={author.bio ?? undefined} />}
        >
          {/* Author avatar */}
          {author.avatar && (
            <div className="mb-6 flex items-center gap-4">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <Image
                  src={strapiMediaUrl(author.avatar)}
                  alt={author.avatar.alternativeText ?? author.name}
                  fill
                  className="object-cover"
                />
              </div>
              {author.bio && (
                <p className="text-sm text-slate-600 dark:text-slate-400">{author.bio}</p>
              )}
            </div>
          )}

          {/* Articles */}
          {articles.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">{t('authorArticlesEmpty')}</p>
          ) : (
            <ArticleCardList articles={articles} locale={locale} blogBase={blogBase} />
          )}

          {pagination.pageCount > 1 && (
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.pageCount}
              basePath={basePath}
            />
          )}

          {/* Latest reviews — page 1 only */}
          {authorReviews.length > 0 && (
            <div className="mt-10 lg:mt-14">
              <SectionTitle as="h3" title={t('latestReviews', { name: author.name })} />
              <SiteCardGrid
                items={authorReviews.map((review) => ({
                  site: review.site,
                  review: { score: computeScore(review) },
                }))}
                cols={2}
              />
            </div>
          )}
        </SidebarLayout>
      </Container>
    </>
  );
}
