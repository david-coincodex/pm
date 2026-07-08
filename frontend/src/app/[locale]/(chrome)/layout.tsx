import Header from '@/components/Header';
import Footer from '@/components/Footer';
import OfferPopupProvider, { type CrossSellSite } from '@/components/offer/OfferPopupProvider';
import { getFeaturedDeals, getMaxDiscountPercent, strapiMediaUrl } from '@/lib/strapi';

export default async function ChromeLayout({ children }: { children: React.ReactNode }) {
  // Featured sites used for the "you might also like" cross-sell in the offer popup.
  const featuredDeals = await getFeaturedDeals().catch(() => []);
  const featured: CrossSellSite[] = featuredDeals
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

  return (
    <OfferPopupProvider featured={featured}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </OfferPopupProvider>
  );
}
