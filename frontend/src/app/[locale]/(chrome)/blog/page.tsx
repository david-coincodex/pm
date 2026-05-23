import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { routes } from '@/lib/routes';
import { getArticlesPaginated, strapiMediaUrl } from '@/lib/strapi';
import { parsePage, paginatedAlternates, paginatedNavLinks, paginatedTitle } from '@/lib/pagination';
import Container from '@/components/Container';
import SectionTitle from '@/components/SectionTitle';
import Pagination from '@/components/Pagination';

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

  const basePath = locale === 'en' ? '/blog/' : `/${locale}/blog/`;
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
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={routes.blogArticle(article.id, article.slug)}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:shadow-slate-900/50"
              >
                {article.coverImage && (
                  <div className="aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-700">
                    <Image
                      src={strapiMediaUrl(article.coverImage)}
                      alt={article.coverImage.alternativeText ?? article.title}
                      width={article.coverImage.width}
                      height={article.coverImage.height}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  </div>
                )}

                <div className="flex flex-1 flex-col gap-3 p-5">
                  {article.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {article.categories.map((cat) => (
                        <span
                          key={cat.id}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                        >
                          {cat.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <h2 className="text-lg font-semibold leading-snug text-slate-900 group-hover:text-emerald-600 dark:text-white dark:group-hover:text-emerald-400">
                    {article.title}
                  </h2>

                  {article.description && (
                    <p className="line-clamp-3 text-sm text-slate-500 dark:text-slate-400">
                      {article.description}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between pt-3 text-xs text-slate-400">
                    {article.authors.length > 0 && (
                      <span>
                        {t('by')} {article.authors.map((a) => a.name).join(', ')}
                      </span>
                    )}
                    {article.publishedAt && (
                      <time dateTime={article.publishedAt}>
                        {new Date(article.publishedAt).toLocaleDateString(locale, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
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
