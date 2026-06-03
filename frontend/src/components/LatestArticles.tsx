import { getTranslations } from 'next-intl/server';
import { getLatestArticles } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import Container from '@/components/Container';
import SectionTitle from '@/components/SectionTitle';
import ArticleHeroGrid from '@/components/ArticleHeroGrid';

interface LatestArticlesProps {
  locale: string;
  limit?: number;
}

export default async function LatestArticles({ locale, limit = 8 }: LatestArticlesProps) {
  const t = await getTranslations('latestArticles');
  const articles = await getLatestArticles(locale, limit).catch(() => []);

  if (articles.length === 0) return null;

  const blogBase = routes.blog().slice(0, -1);

  return (
    <section className="py-14">
      <Container>
        <SectionTitle
          title={t('title')}
          tag={t('eyebrow')}
          link={blogBase}
          linkLabel={t('viewAll')}
        />
        <ArticleHeroGrid articles={articles} locale={locale} blogBase={blogBase} />
      </Container>
    </section>
  );
}
