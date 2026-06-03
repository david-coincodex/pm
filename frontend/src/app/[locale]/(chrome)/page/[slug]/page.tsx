import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPageBySlug } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import { localizedAlternates } from '@/lib/pagination';
import Container from '@/components/Container';
import SidebarLayout from '@/components/SidebarLayout';
import RichText from '@/components/RichText';
import BreadcrumbsSetter from '@/components/BreadcrumbsSetter';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const cmsPage = await getPageBySlug(slug, locale);
  if (!cmsPage) return {};
  const pagePath = routes.page(slug);
  const title = cmsPage.metaTitle ?? cmsPage.title;
  const description = cmsPage.metaDescription ?? undefined;

  return {
    title,
    description,
    alternates: localizedAlternates(pagePath, locale),
  };
}

export default async function CmsPage({ params }: Props) {
  const { locale, slug } = await params;
  const cmsPage = await getPageBySlug(slug, locale);

  if (!cmsPage) notFound();

  return (
    <>
      <BreadcrumbsSetter crumbs={[
        { label: cmsPage.h1 ?? cmsPage.title, href: routes.page(slug) },
      ]} />
      <Container className="py-10 lg:py-14">
      <SidebarLayout reversed sidebar={<div />}>
        <h1 className="mb-8 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {cmsPage.h1 ?? cmsPage.title}
        </h1>
        {cmsPage.content && (
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <RichText content={cmsPage.content} />
          </div>
        )}
      </SidebarLayout>
    </Container>
    </>
  );
}
