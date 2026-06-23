import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { getSaleBySlug, getAllSaleSlugs, getDiscountPercent, type Sale } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import { localizedAlternates } from '@/lib/pagination';
import Container from '@/components/Container';
import RichText from '@/components/RichText';
import SectionTitle from '@/components/SectionTitle';
import SiteCardGrid from '@/components/site/SiteCardGrid';
import SiteBundlesSection from '@/components/site/SiteBundlesSection';
import SaleHero from '@/components/sale/SaleHero';
import BreadcrumbsSetter from '@/components/BreadcrumbsSetter';
import FaqSection from '@/components/FaqSection';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const slugs = await getAllSaleSlugs().catch(() => []);
  return routing.locales.flatMap((locale) =>
    slugs.map((slug) => ({ locale, slug }))
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const sale = await getSaleBySlug(slug, locale);
  if (!sale) return {};

  const salePath = routes.sale(slug);

  return {
    title: sale.metaTitle ?? sale.title,
    description: sale.metaDescription ?? sale.description ?? undefined,
    alternates: localizedAlternates(salePath, locale),
  };
}

function buildSiteItem(site: Sale['sites'][number]) {
  const activeOffers = (site.offers ?? []).filter((o) => o.isActive).sort((a, b) => a.price - b.price);
  const bestOffer = activeOffers[0];
  return {
    site,
    bestPrice: bestOffer?.price,
    bestOfferId: bestOffer?.id,
    bestFullPrice: bestOffer?.full_price ?? undefined,
    discountPercent: bestOffer ? getDiscountPercent(bestOffer) ?? undefined : undefined,
  };
}

export default async function SalePage({ params }: Props) {
  const { locale, slug } = await params;

  const [sale, t] = await Promise.all([
    getSaleBySlug(slug, locale),
    getTranslations({ locale, namespace: 'sale' }),
  ]);

  if (!sale) notFound();

  const hasFeatured = (sale.featuredSites ?? []).length > 0;
  const featuredIds = new Set((sale.featuredSites ?? []).map((s) => s.id));
  const allItems = (sale.sites ?? [])
    .filter((s) => !featuredIds.has(s.id))
    .map((s) => buildSiteItem(s));

  return (
    <>
      <BreadcrumbsSetter crumbs={[
        { label: sale.title, href: routes.sale(sale.slug) },
      ]} />
      {/* ── Hero (title, description, countdown, featured deals) ── */}
      <SaleHero sale={sale} />

      {/* ── All deals ────────────────────────────────────── */}
      {allItems.length > 0 && (
        <Container className={hasFeatured ? 'pt-14 pb-14' : 'py-14'}>
          {hasFeatured && <SectionTitle title={t('allDeals', { saleName: sale.title })} />}
          <SiteCardGrid items={allItems} />
        </Container>
      )}

      {/* ── Bundles ──────────────────────────────────────── */}
      {(sale.bundles ?? []).length > 0 && (
        <SiteBundlesSection
          bundles={sale.bundles ?? []}
          siteIncluded={false}
          siteName={sale.title}
          locale={locale}
        />
      )}

      {/* ── Content blocks ───────────────────────────────── */}
      {sale.content && (
        <Container className="py-10 lg:py-14">
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <RichText content={sale.content} />
          </div>
        </Container>
      )}

      <FaqSection faqs={sale.faqs} />
    </>
  );
}
