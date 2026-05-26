import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import type { Article } from '@/lib/strapi';
import { strapiMediaUrl } from '@/lib/strapi';

function formatDate(dateStr: string, locale: string): string {
  return new Date(dateStr).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

interface ArticleCardListProps {
  articles: Article[];
  locale: string;
  blogBase: string;
}

export default function ArticleCardList({ articles, locale, blogBase }: ArticleCardListProps) {
  if (articles.length === 0) return null;

  return (
    <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
      {articles.map((article) => (
        <Link
          key={article.id}
          href={`${blogBase}/${article.id}/${article.slug}`}
          className="group flex gap-4 py-5 first:pt-0 last:pb-0"
        >
          {/* Thumbnail */}
          <div className="relative h-24 w-36 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 sm:h-28 sm:w-44">
            {article.coverImage ? (
              <Image
                src={strapiMediaUrl(article.coverImage)}
                alt={article.coverImage.alternativeText ?? article.title}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 640px) 144px, 176px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6" />
                </svg>
              </div>
            )}
          </div>

          {/* Text */}
          <div className="flex min-w-0 flex-col justify-center gap-1">
            {article.categories?.[0] && (
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                {article.categories[0].name}
              </span>
            )}
            <h3 className="line-clamp-2 font-semibold text-slate-900 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400">
              {article.title}
            </h3>
            {article.description && (
              <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400 hidden sm:block">
                {article.description}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {article.publishDate
                ? formatDate(article.publishDate, locale)
                : article.publishedAt
                  ? formatDate(article.publishedAt, locale)
                  : ''}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
