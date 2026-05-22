import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getArticleById, strapiMediaUrl } from '@/lib/strapi';
import Container from '@/components/Container';

type Props = { params: Promise<{ locale: string; id: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const article = await getArticleById(Number(id), locale);
  if (!article) return {};

  const canonical =
    locale === routing.defaultLocale
      ? `/blog/${article.id}/${article.slug}/`
      : `/${locale}/blog/${article.id}/${article.slug}/`;

  return {
    title: article.metaTitle ?? article.title,
    description: article.description ?? undefined,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        routing.locales.map((loc) => [
          loc,
          loc === routing.defaultLocale
            ? `/blog/${article.id}/${article.slug}/`
            : `/${loc}/blog/${article.id}/${article.slug}/`,
        ])
      ),
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { locale, id } = await params;

  const [article, t] = await Promise.all([
    getArticleById(Number(id), locale),
    getTranslations({ locale, namespace: 'blog' }),
  ]);

  if (!article) notFound();

  return (
    <Container className="py-10">
      <article className="mx-auto max-w-3xl">
        {/* Cover image */}
        {article.coverImage && (
          <div className="mb-8 aspect-video w-full overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
            <Image
              src={strapiMediaUrl(article.coverImage)}
              alt={article.coverImage.alternativeText ?? article.title}
              width={article.coverImage.width}
              height={article.coverImage.height}
              className="h-full w-full object-cover"
              priority
            />
          </div>
        )}

        {/* Categories */}
        {article.categories.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {article.categories.map((cat) => (
              <span
                key={cat.id}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              >
                {cat.name}
              </span>
            ))}
          </div>
        )}

        {/* Title */}
        <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          {article.title}
        </h1>

        {/* Description */}
        {article.description && (
          <p className="mb-6 text-lg leading-relaxed text-slate-500 dark:text-slate-400">
            {article.description}
          </p>
        )}

        {/* Meta: authors / date */}
        <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-200 pb-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {(article.authors ?? []).length > 0 && (
            <div className="flex items-center gap-2">
              {article.authors[0].avatar && (
                <div className="h-8 w-8 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <Image
                    src={strapiMediaUrl(article.authors[0].avatar)}
                    alt={article.authors[0].name}
                    width={32}
                    height={32}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <span>
                {t('by')} <strong className="font-medium text-slate-700 dark:text-slate-200">{(article.authors ?? []).map((a) => a.name).join(', ')}</strong>
              </span>
            </div>
          )}

          {(article.editors ?? []).length > 0 && (
            <span>
              {t('editedBy')} <strong className="font-medium text-slate-700 dark:text-slate-200">{(article.editors ?? []).map((e) => e.name).join(', ')}</strong>
            </span>
          )}

          {article.publishedAt && (
            <time dateTime={article.publishedAt} className="ml-auto">
              {new Date(article.publishedAt).toLocaleDateString(locale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
          )}
        </div>

        {/* Tags */}
        {(article.tags ?? []).length > 0 && (
          <div className="mb-8 flex flex-wrap gap-2">
            {(article.tags ?? []).map((tag) => (
              <span
                key={tag.id}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
              >
                #{tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Content — placeholder for Strapi blocks renderer */}
        {article.content && (
          <div className="prose prose-slate max-w-none dark:prose-invert">
            {/* TODO: replace with a Strapi blocks renderer component */}
            <pre className="whitespace-pre-wrap text-xs text-slate-400">
              {JSON.stringify(article.content, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-10">
          <Link
            href="/blog"
            className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          >
            ← {t('pageTitle')}
          </Link>
        </div>
      </article>
    </Container>
  );
}
