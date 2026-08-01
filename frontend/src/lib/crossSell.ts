import { getFeaturedDeals, getMaxDiscountPercent, strapiMediaUrl } from '@/lib/strapi';
import type { CrossSellSite } from '@/components/offer/types';

/**
 * Compact cross-sell list for the offer popup's "you might also like" step.
 *
 * This used to be fetched in the `(chrome)` layout and passed down as props, which
 * put a blocking Strapi round trip in front of every page in the group — for data
 * the popup only reads after the user clicks through it. It is now served by
 * /api/featured and fetched lazily on first popup open.
 */
export async function getCrossSellSites(): Promise<CrossSellSite[]> {
  const deals = await getFeaturedDeals();
  return deals
    .filter((f) => f.site)
    .map((f) => {
      const activeOffers = (f.site.offers ?? []).filter((o) => o.isActive);
      const best = [...activeOffers].sort((a, b) => a.price - b.price)[0];
      const image = f.site.cover_image ?? f.site.logo;
      return {
        slug: f.site.slug,
        name: f.site.name,
        price: best?.price ?? null,
        fullPrice: best?.full_price ?? null,
        discountPercent: getMaxDiscountPercent(activeOffers),
        imageUrl: image ? strapiMediaUrl(image) : null,
      };
    });
}
