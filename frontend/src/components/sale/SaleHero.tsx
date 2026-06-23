import { getTranslations } from 'next-intl/server';
import type { Sale } from '@/lib/strapi';
import { getDiscountPercent } from '@/lib/strapi';
import Container from '@/components/Container';
import SiteCardRow from '@/components/site/SiteCardRow';
import SaleCountdown from '@/components/sale/SaleCountdown';

interface SaleHeroProps {
  sale: Sale;
}

export default async function SaleHero({ sale }: SaleHeroProps) {
  const t = await getTranslations('sale');

  const featuredItems = (sale.featuredSites ?? []).map((site) => {
    const activeOffers = (site.offers ?? [])
      .filter((o) => o.isActive)
      .sort((a, b) => a.price - b.price);
    const bestOffer = activeOffers[0];
    return {
      site,
      bestPrice: bestOffer?.price,
      bestOfferId: bestOffer?.id,
      bestFullPrice: bestOffer?.full_price ?? undefined,
      discountPercent: bestOffer ? getDiscountPercent(bestOffer) ?? undefined : undefined,
    };
  });

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -mt-10 pb-14 pt-24 z-10">
      {/* Decorative orb — centred behind the title */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: sale.themeColor + '18' }}
      />

      <Container className="relative" padded={false}>
        {/* Title + description + countdown */}
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          {sale.badgeLabel && (
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest"
              style={{
                backgroundColor: sale.themeColor + '25',
                color: sale.themeColor,
              }}
            >
              {sale.badgeLabel}
            </span>
          )}

          <h1
            className="text-4xl font-black tracking-tight sm:text-5xl text-white"
          >
            {sale.title}
          </h1>

          {sale.description && (
            <p className="max-w-2xl text-lg text-slate-300">
              {sale.description}
            </p>
          )}

          <SaleCountdown endsAt={sale.endsAt} themeColor={sale.themeColor} />
        </div>

        {/* Featured deals */}
        {featuredItems.length > 0 && (
          <SiteCardRow items={featuredItems} columns={featuredItems.length} variant="dark" />
        )}
      </Container>
    </section>
  );
}
