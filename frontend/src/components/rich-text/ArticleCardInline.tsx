import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { type Article, strapiMediaUrl } from '@/lib/strapi';
import { routes } from '@/lib/routes';

function formatDate(dateStr: string, locale: string): string {
  return new Date(dateStr).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const PlaceholderIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6" />
  </svg>
);

interface ArticleCardInlineProps {
  article: Article;
  locale: string;
}

export default function ArticleCardInline({ article, locale }: ArticleCardInlineProps) {
  const href = routes.blogArticle(article.id, article.slug);

  return (
    <Link
      href={href}
      className="not-prose group my-4 flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
    >
      {/* Cover image — left side */}
      <div className="relative w-28 shrink-0 self-stretch overflow-hidden bg-slate-100 dark:bg-slate-700 sm:w-36">
        {article.coverImage ? (
          <Image
            src={strapiMediaUrl(article.coverImage)}
            alt={article.coverImage.alternativeText ?? article.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 112px, 144px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-600">
            <PlaceholderIcon className="h-8 w-8" />
          </div>
        )}
        {/* Category badge */}
        {article.categories?.[0] && (
          <span className="absolute left-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
            {article.categories[0].name}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-col justify-center gap-1.5 p-4">
        <h3 className="line-clamp-2 text-sm font-semibold text-slate-900 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400">
          {article.title}
        </h3>
        {article.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {article.description}
          </p>
        )}
        <p className="mt-auto pt-1 text-xs text-slate-400 dark:text-slate-500">
          {article.publishedAt ? formatDate(article.publishedAt, locale) : ''}
        </p>
      </div>
    </Link>
  );
}
