import { setRequestLocale } from 'next-intl/server';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import OfferPopupProvider from '@/components/offer/OfferPopupProvider';
import { FavoritesProvider } from '@/hooks/useFavorites';

/**
 * No data fetching here on purpose. A layout's `children` cannot start rendering until the
 * layout's own body resolves, so any I/O here delays the first byte of every page in the
 * group. The cross-sell data this used to fetch is now loaded lazily from /api/featured when
 * the offer popup first opens (see OfferPopupProvider) — awaiting `params` costs nothing.
 *
 * setRequestLocale is required in EVERY layout and page that touches next-intl, not just the
 * root one: layouts and pages render in parallel, so a parent's call is not guaranteed to have
 * happened when this subtree runs. Without it, Header and Footer resolve the locale by reading
 * request headers, and that one read makes every page in the group dynamic — no static render,
 * no full-route cache, every visitor paying for a fresh render.
 */
export default async function ChromeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <OfferPopupProvider>
      {/* Client provider with server children — costs nothing on the server render path. */}
      <FavoritesProvider>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </FavoritesProvider>
    </OfferPopupProvider>
  );
}
