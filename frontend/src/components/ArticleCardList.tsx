import type { Article } from '@/lib/strapi';
import ArticleCard from '@/components/ArticleCard';

interface ArticleCardListProps {
  articles: Article[];
  locale: string;
}

export default function ArticleCardList({ articles, locale }: ArticleCardListProps) {
  if (articles.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} locale={locale} variant="compact" />
      ))}
    </div>
  );
}
