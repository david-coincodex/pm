import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getLatestArticles, strapiMediaUrl } from '@/lib/strapi';
import Container from '@/components/Container';

interface LatestArticlesProps {
  locale: string;
  limit?: number;
}

function formatDate(dateStr: string, locale: string): string {
  return new Date(dateStr).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default async function LatestArticles({ locale, limit = 8 }: LatestArticlesProps) {
  const t = await getTranslations('latestArticles');
  const articles = await getLatestArticles(locale, limit).catch(() => []);

  if (articles.length === 0) return null;

  const [featured, ...rest] = articles;

  const blogBase = locale === 'en' ? '/blog' : `/${locale}/blog`;

  return (
    <section className="py-14">
      <Container>
        {/* Header */}
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              {t('eyebrow')}
            </p>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              {t('title')}
            </h2>
          </div>
          <Link
            href={blogBase}
            className="shrink-0 text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {t('viewAll')} →
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Featured article — spans 2 columns on lg */}
          <Link
            href={`${blogBase}/${featured.id}/${featured.slug}`}
            className="group lg:col-span-2"
          >
            <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
              <div className="relative aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-700">
                {featured.coverImage ? (
                  <Image
                    src={strapiMediaUrl(featured.coverImage)}
                    alt={featured.coverImage.alternativeText ?? featured.title}
                    width={featured.coverImage.width}
                    height={featured.coverImage.height}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6" />
                    </svg>
                  </div>
                )}
                {featured.categories?.[0] && (
                  <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
                    {featured.categories[0].name}
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400 transition-colors">
                  {featured.title}
                </h3>
                {featured.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3">
                    {featured.description}
                  </p>
                )}
                <p className="mt-auto pt-2 text-xs text-slate-400 dark:text-slate-500">
                  {featured.publishedAt ? formatDate(featured.publishedAt, locale) : ''}
                </p>
              </div>
            </article>
          </Link>

          {/* Side column: up to 3 smaller articles */}
          <div className="flex flex-col gap-4">
            {rest.slice(0, 3).map((article) => (
              <Link
                key={article.id}
                href={`${blogBase}/${article.id}/${article.slug}`}
                className="group flex gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
              >
                {article.coverImage && (
                  <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-700">
                    <Image
                      src={strapiMediaUrl(article.coverImage)}
                      alt={article.coverImage.alternativeText ?? article.title}
                      width={article.coverImage.width}
                      height={article.coverImage.height}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                )}
                <div className="flex min-w-0 flex-col justify-center gap-1">
                  <h3 className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400 transition-colors line-clamp-2">
                    {article.title}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {article.publishedAt ? formatDate(article.publishedAt, locale) : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Bottom row: remaining articles */}
        {rest.length > 3 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rest.slice(3).map((article) => (
              <Link
                key={article.id}
                href={`${blogBase}/${article.id}/${article.slug}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-700">
                  {article.coverImage ? (
                    <Image
                      src={strapiMediaUrl(article.coverImage)}
                      alt={article.coverImage.alternativeText ?? article.title}
                      width={article.coverImage.width}
                      height={article.coverImage.height}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <h3 className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400 transition-colors line-clamp-2">
                    {article.title}
                  </h3>
                  <p className="mt-auto pt-1 text-xs text-slate-400 dark:text-slate-500">
                    {article.publishedAt ? formatDate(article.publishedAt, locale) : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
