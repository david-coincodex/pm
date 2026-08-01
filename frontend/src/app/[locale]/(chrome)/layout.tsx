import Header from '@/components/Header';
import Footer from '@/components/Footer';
import OfferPopupProvider from '@/components/offer/OfferPopupProvider';

/**
 * Deliberately synchronous. A layout's `children` cannot start rendering until the
 * layout's own body resolves, so any `await` here delays the first byte of every
 * page in the group. The cross-sell data this used to fetch is now loaded lazily
 * from /api/featured when the offer popup first opens (see OfferPopupProvider).
 */
export default function ChromeLayout({ children }: { children: React.ReactNode }) {
  return (
    <OfferPopupProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </OfferPopupProvider>
  );
}
