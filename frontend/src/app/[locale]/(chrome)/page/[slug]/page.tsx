import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import { getPageBySlug } from '@/lib/strapi';
import Container from '@/components/Container';
import SidebarLayout from '@/components/SidebarLayout';
import RichText from '@/components/RichText';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) return {};

  const canonical =
    locale === routing.defaultLocale ? `/page/${slug}/` : `/${locale}/page/${slug}/`;

  return {
    title: page.metaTitle ?? page.title,
    description: page.metaDescription ?? undefined,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        routing.locales.map((loc) => [
          loc,
          loc === routing.defaultLocale ? `/page/${slug}/` : `/${loc}/page/${slug}/`,
        ])
      ),
    },
  };
}

export default async function CmsPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);

  if (!page) notFound();

  return (
    <Container className="py-10 lg:py-14">
      <SidebarLayout reversed sidebar={<div />}>
        <h1 className="mb-8 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {page.h1 ?? page.title}
        </h1>
        {page.content && (
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <RichText content={page.content} />
          </div>
        )}
      </SidebarLayout>
    </Container>
  );
}
