import type { Article } from '@/lib/strapi';
import ArticleCard from '@/components/ArticleCard';

interface ArticleHeroGridProps {
  articles: Article[];
  locale: string;
  /** Show the featured hero row at the top. Disable on paginated pages (page 2+). */
  hero?: boolean;
  /**
   * Preload the featured card's cover. Only enable where this grid is genuinely the
   * first thing in the viewport (the /blog listing) — as a "latest articles" section
   * further down a page, preloading it competes with that page's real LCP image.
   */
  priorityHero?: boolean;
}

export default function ArticleHeroGrid({ articles, locale, hero = true, priorityHero = false }: ArticleHeroGridProps) {
  if (articles.length === 0) return null;

  const [featured, ...rest] = articles;
  const sidebar = hero ? rest.slice(0, 3) : [];
  // With the hero row, the grid holds everything after the featured + sidebar.
  // Without it, every article goes into the regular grid.
  const gridArticles = hero ? rest.slice(3) : articles;

  return (
    <div className="flex flex-col gap-3 sm:gap-6">
      {/* Hero row: 1 big featured + 3 compact sidebar cards (page 1 only) */}
      {hero && (
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
          <ArticleCard article={featured} locale={locale} variant="featured" priority={priorityHero} className="lg:col-span-2" />

          {sidebar.length > 0 && (
            <div className="flex flex-col gap-3">
              {sidebar.map((article) => (
                <ArticleCard key={article.id} article={article} locale={locale} variant="compact" className="min-h-0 flex-1" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Regular card grid (all articles on page 2+, overflow on page 1) */}
      {gridArticles.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {gridArticles.map((article) => (
            <ArticleCard key={article.id} article={article} locale={locale} variant="grid" />
          ))}
        </div>
      )}
    </div>
  );
}
