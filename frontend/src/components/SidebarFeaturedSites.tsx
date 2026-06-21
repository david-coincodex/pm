import { getFeaturedDeals, getDiscountPercent } from '@/lib/strapi';
import { getTranslations } from 'next-intl/server';
import SiteCard from '@/components/site/SiteCard';
import SidebarCarouselShell from '@/components/SidebarCarouselShell';

export default async function SidebarFeaturedSites() {
  const [featured, t] = await Promise.all([
    getFeaturedDeals(),
    getTranslations('discount'),
  ]);

  const items = featured.slice(0, 3);
  if (items.length === 0) return null;

  const cards = items.map((f) => {
    const site = f.site;
    const activeOffers = (site.offers ?? []).filter((o) => o.isActive);
    const bestOffer = activeOffers.length
      ? activeOffers.reduce((best, o) => {
          const d = getDiscountPercent(o) ?? 0;
          const bd = getDiscountPercent(best) ?? 0;
          return d > bd ? o : best;
        }, activeOffers[0])
      : null;
    const discountPercent = bestOffer ? (getDiscountPercent(bestOffer) ?? undefined) : undefined;

    return (
      <SiteCard
        key={site.id}
        site={site}
        bestPrice={bestOffer?.price}
        bestFullPrice={bestOffer?.full_price ?? undefined}
        bestOfferId={bestOffer?.id}
        discountPercent={discountPercent}
        isCamSite={site.siteType === 'camsite'}
      />
    );
  });

  return (
    <SidebarCarouselShell title={t('featuredSites')}>
      {cards}
    </SidebarCarouselShell>
  );
}
