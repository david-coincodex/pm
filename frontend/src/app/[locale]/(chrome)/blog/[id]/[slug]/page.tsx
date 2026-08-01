import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { getArticleByPostId, getArticleBySlug, getLatestArticles, strapiMediaUrl } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import { localizedAlternates } from '@/lib/pagination';
import { siteSettings } from '@/lib/siteSettings';
import Container from '@/components/Container';
import Breadcrumbs from '@/components/Breadcrumbs';
import SidebarLayout from '@/components/SidebarLayout';
import SidebarLayoutHeader from '@/components/SidebarLayoutHeader';
import RichText from '@/components/RichText';
import SectionTitle from '@/components/SectionTitle';
import ArticleHeroGrid from '@/components/ArticleHeroGrid';
import FaqSection from '@/components/FaqSection';
import ContentMeta from '@/components/ContentMeta';
import SidebarCategorySites from '@/components/SidebarCategorySites';
import SidebarFeaturedSites from '@/components/SidebarFeaturedSites';

/** Returns true if modifiedDate is more than 24 h after the publish date. */
function isSignificantUpdate(publishIso: string | null | undefined, modifiedIso: string | null | undefined): boolean {
  if (!publishIso || !modifiedIso) return false;
  return new Date(modifiedIso).getTime() - new Date(publishIso).getTime() > 24 * 60 * 60 * 1000;
}

type Props = { params: Promise<{ locale: string; id: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id, slug } = await params;
  // Same resolution order as the page — Next dedups identical fetches per request, so
  // this costs nothing extra.
  const article =
    (await getArticleByPostId(Number(id), locale)) ?? (await getArticleBySlug(slug, locale));
  if (!article) return {};

  const articlePath = routes.blogArticle(article.postId ?? article.id, article.slug);

  return {
    title: article.metaTitle ?? article.title,
    description: article.description ?? undefined,
    alternates: localizedAlternates(articlePath, locale),
    openGraph: {
      type: 'article',
      title: article.metaTitle ?? article.title,
      description: article.description ?? undefined,
      ...(article.coverImage && { images: [{ url: strapiMediaUrl(article.coverImage) }] }),
      publishedTime: article.publishDate ?? article.publishedAt ?? undefined,
      modifiedTime: isSignificantUpdate(article.publishDate ?? article.publishedAt, article.modifiedDate) ? article.modifiedDate! : undefined,
      authors: article.author ? [article.author.name] : [],
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { locale, id, slug } = await params;

  // The id segment is the article's WordPress `postId`, so these URLs stay byte-identical
  // to the ones pornmode.com serves and keep their rankings.
  //
  // getLatestArticles does not depend on the article, so it joins the same wave
  // rather than adding a serial round trip after it.
  const [byPostId, t, tBc, latestArticles] = await Promise.all([
    getArticleByPostId(Number(id), locale),
    getTranslations({ locale, namespace: 'blog' }),
    getTranslations({ locale, namespace: 'breadcrumbs' }),
    getLatestArticles(locale, 9).catch(() => []),
  ]);

  // Fall back to the slug so a stale/renumbered id still resolves (and then redirects)
  // instead of 404ing.
  const article = byPostId ?? (await getArticleBySlug(slug, locale));
  if (!article) notFound();

  // Send any non-canonical URL to the canonical one with a 308 (Google treats it as a 301;
  // plain redirect() would be a 307 and pass no link equity). This also closes a live
  // duplicate-content hole: the slug segment was previously never validated, so
  // /blog/<id>/anything/ returned 200.
  const canonicalId = article.postId ?? article.id;
  if (String(canonicalId) !== id || article.slug !== slug) {
    permanentRedirect(routes.blogArticle(canonicalId, article.slug));
  }

  const blogBase = routes.blog().slice(0, -1);
  const relatedArticles = latestArticles.filter((a) => a.id !== article.id).slice(0, 8);

  return (
    <>
      <Breadcrumbs locale={locale} crumbs={[
        { label: tBc('blog'), href: routes.blog() },
        { label: article.title, href: routes.blogArticle(canonicalId, article.slug) },
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
          header={<SidebarLayoutHeader title={article.title} description={article.description} />}
        >
          {/* Cover image */}
          <div className="mb-8 aspect-video w-full overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
            {article.coverImage ? (
              <Image
                src={strapiMediaUrl(article.coverImage)}
                alt={article.coverImage.alternativeText ?? article.title}
                width={article.coverImage.width}
                height={article.coverImage.height}
                className="h-full w-full object-cover"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-300 dark:text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6" />
                </svg>
              </div>
            )}
          </div>

          {/* Meta: author / date */}
          <ContentMeta
            author={article.author}
            publishDate={article.publishDate}
            publishedAt={article.publishedAt}
            modifiedDate={article.modifiedDate}
            locale={locale}
            showUpdated={isSignificantUpdate(article.publishDate ?? article.publishedAt, article.modifiedDate)}
          />

          {/* Content */}
          {article.content && <RichText content={article.content} locale={locale} />}

          {/* FAQ — below the content, inside the main container */}
          <FaqSection faqs={article.faqs} bare />
        </SidebarLayout>
      </Container>

      {relatedArticles.length > 0 && (
        <section className="pt-0 pb-10 lg:pb-14">
          <Container padded={false}>
            <SectionTitle title={t('peopleAlsoRead')} link={blogBase} linkLabel={t('viewAll')} />
            <ArticleHeroGrid articles={relatedArticles} locale={locale} />
          </Container>
        </section>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: article.title,
            description: article.description ?? undefined,
            ...(article.coverImage && { image: strapiMediaUrl(article.coverImage) }),
            datePublished: article.publishDate ?? article.publishedAt,
            ...(isSignificantUpdate(article.publishDate ?? article.publishedAt, article.modifiedDate) && { dateModified: article.modifiedDate }),
            author: article.author ? [{
              '@type': 'Person',
              name: article.author.name,
              url: `${siteSettings.baseUrl}${routes.blogAuthor(article.author.slug)}`,
              ...(article.author.bio && { description: article.author.bio }),
            }] : [],
          }),
        }}
      />
    </>
  );
}
