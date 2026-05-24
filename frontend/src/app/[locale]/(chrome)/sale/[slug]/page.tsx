import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { getSaleBySlug, getDiscountPercent, type Sale } from '@/lib/strapi';
import Container from '@/components/Container';
import RichText from '@/components/RichText';
import SectionTitle from '@/components/SectionTitle';
import SiteCardGrid from '@/components/site/SiteCardGrid';
import SiteBundlesSection from '@/components/site/SiteBundlesSection';
import SaleCountdown from '@/components/sale/SaleCountdown';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const sale = await getSaleBySlug(slug);
  if (!sale) return {};

  const canonical =
    locale === routing.defaultLocale ? `/sale/${slug}/` : `/${locale}/sale/${slug}/`;

  return {
    title: sale.metaTitle ?? sale.title,
    description: sale.metaDescription ?? sale.description ?? undefined,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        routing.locales.map((loc) => [
          loc,
          loc === routing.defaultLocale ? `/sale/${slug}/` : `/${loc}/sale/${slug}/`,
        ])
      ),
    },
  };
}

function buildSiteItem(site: Sale['sites'][number]) {
  const activeOffers = (site.offers ?? []).filter((o) => o.isActive).sort((a, b) => a.price - b.price);
  const bestOffer = activeOffers[0];
  return {
    site,
    bestPrice: bestOffer?.price,
    bestOfferId: bestOffer?.id,
    discountPercent: bestOffer ? getDiscountPercent(bestOffer) ?? undefined : undefined,
  };
}

export default async function SalePage({ params }: Props) {
  const { locale, slug } = await params;

  const [sale, t] = await Promise.all([
    getSaleBySlug(slug),
    getTranslations({ locale, namespace: 'sale' }),
  ]);

  if (!sale) notFound();

  const featuredItems = (sale.featuredSites ?? []).map((s) => buildSiteItem(s));
  // All sites excluding the featured ones to avoid duplication
  const featuredIds = new Set((sale.featuredSites ?? []).map((s) => s.id));
  const remainingItems = (sale.sites ?? [])
    .filter((s) => !featuredIds.has(s.id))
    .map((s) => buildSiteItem(s));

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        className="py-14"
        style={{
          background: `linear-gradient(135deg, ${sale.themeColor}22 0%, transparent 60%)`,
          borderBottom: `2px solid ${sale.themeColor}33`,
        }}
      >
        <Container>
          <div className="flex flex-col items-start gap-4">
            <h1
              className="text-4xl font-black tracking-tight sm:text-5xl"
              style={{ color: sale.themeColor }}
            >
              {sale.title}
            </h1>
            {sale.description && (
              <p className="max-w-2xl text-lg text-slate-600 dark:text-slate-300">
                {sale.description}
              </p>
            )}
            <SaleCountdown endsAt={sale.endsAt} themeColor={sale.themeColor} />
          </div>
        </Container>
      </section>

      {/* ── Featured deals ───────────────────────────────── */}
      {featuredItems.length > 0 && (
        <Container className="pt-14">
          <SectionTitle title={t('featuredDeals')} />
          <SiteCardGrid items={featuredItems} />
        </Container>
      )}

      {/* ── All deals ────────────────────────────────────── */}
      {remainingItems.length > 0 && (
        <Container className={featuredItems.length > 0 ? 'pt-14 pb-14' : 'py-14'}>
          {featuredItems.length > 0 && <SectionTitle title={t('allDeals')} />}
          <SiteCardGrid items={remainingItems} />
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
        <Container className="py-14">
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <RichText content={sale.content} />
          </div>
        </Container>
      )}
    </>
  );
}
