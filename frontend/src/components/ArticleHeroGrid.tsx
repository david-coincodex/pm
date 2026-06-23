import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import type { Article } from '@/lib/strapi';
import { strapiMediaUrl } from '@/lib/strapi';

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

interface ArticleHeroGridProps {
  articles: Article[];
  locale: string;
  blogBase: string;
  /** Show the featured hero row at the top. Disable on paginated pages (page 2+). */
  hero?: boolean;
}

export default function ArticleHeroGrid({ articles, locale, blogBase, hero = true }: ArticleHeroGridProps) {
  if (articles.length === 0) return null;

  const [featured, ...rest] = articles;
  const sidebar = hero ? rest.slice(0, 3) : [];
  // With the hero row, the grid holds everything after the featured + sidebar.
  // Without it, every article goes into the regular grid.
  const gridArticles = hero ? rest.slice(3) : articles;

  return (
    <div className="flex flex-col gap-3 sm:gap-6">
      {/* Hero row: 1 big + 3 sidebar (page 1 only) */}
      {hero && (
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        {/* Featured — spans 2 cols */}
        <Link
          href={`${blogBase}/${featured.id}/${featured.slug}`}
          className="group lg:col-span-2"
        >
          <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
            <div className="relative aspect-[16/7] w-full overflow-hidden bg-slate-100 dark:bg-slate-700">
              {featured.coverImage ? (
                <Image
                  src={strapiMediaUrl(featured.coverImage)}
                  alt={featured.coverImage.alternativeText ?? featured.title}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  priority
                />
              ) : (
                <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-600">
                  <PlaceholderIcon className="h-14 w-14" />
                </div>
              )}
              {featured.categories?.[0] && (
                <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
                  {featured.categories[0].name}
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-5">
              <h3 className="text-lg font-bold text-slate-900 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400">
                {featured.title}
              </h3>
              {featured.description && (
                <p className="line-clamp-3 text-sm text-slate-500 dark:text-slate-400">
                  {featured.description}
                </p>
              )}
              <p className="mt-auto pt-2 text-xs text-slate-400 dark:text-slate-500">
                {featured.publishedAt ? formatDate(featured.publishedAt, locale) : ''}
              </p>
            </div>
          </article>
        </Link>

        {/* Sidebar — fills the same height as the featured card */}
        {sidebar.length > 0 && (
          <div className="flex flex-col gap-3">
            {sidebar.map((article) => (
              <Link
                key={article.id}
                href={`${blogBase}/${article.id}/${article.slug}`}
                className="group flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
              >
                {/* Image fills full height of the card row */}
                <div className="relative w-28 shrink-0 self-stretch overflow-hidden bg-slate-100 dark:bg-slate-700">
                  {article.coverImage ? (
                    <Image
                      src={strapiMediaUrl(article.coverImage)}
                      alt={article.coverImage.alternativeText ?? article.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="112px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-600">
                      <PlaceholderIcon className="h-7 w-7" />
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-col justify-center gap-1.5 p-3">
                  {article.categories?.[0] && (
                    <span className="w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {article.categories[0].name}
                    </span>
                  )}
                  <h3 className="line-clamp-2 text-sm font-semibold text-slate-900 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400">
                    {article.title}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {article.publishedAt ? formatDate(article.publishedAt, locale) : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Regular card grid (all articles on page 2+, overflow on page 1).
          Mobile: horizontal cards matching the featured sidebar above (image left, text right).
          sm+: vertical cards in a 2/4-column grid. */}
      {gridArticles.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {gridArticles.map((article) => (
            <Link
              key={article.id}
              href={`${blogBase}/${article.id}/${article.slug}`}
              className="group flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800 sm:flex-col"
            >
              {/* Image: mobile = fixed-width side; sm+ = full-width aspect-video top */}
              <div className="relative w-28 shrink-0 self-stretch overflow-hidden bg-slate-100 dark:bg-slate-700 sm:aspect-video sm:w-full sm:self-auto">
                {article.coverImage ? (
                  <Image
                    src={strapiMediaUrl(article.coverImage)}
                    alt={article.coverImage.alternativeText ?? article.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 112px, (max-width: 1024px) 50vw, 25vw"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-600">
                    <PlaceholderIcon className="h-7 w-7 sm:h-8 sm:w-8" />
                  </div>
                )}
                {/* sm+ only: emerald badge overlaid on the cover */}
                {article.categories?.[0] && (
                  <span className="absolute left-2 top-2 hidden rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white sm:block">
                    {article.categories[0].name}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-3 sm:justify-start sm:gap-1">
                {/* Mobile only: inline badge chip, matching the sidebar cards */}
                {article.categories?.[0] && (
                  <span className="w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300 sm:hidden">
                    {article.categories[0].name}
                  </span>
                )}
                <h3 className="line-clamp-2 text-sm font-semibold text-slate-900 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400">
                  {article.title}
                </h3>
                <p className="pt-1 text-xs text-slate-400 dark:text-slate-500 sm:mt-auto">
                  {article.publishedAt ? formatDate(article.publishedAt, locale) : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
