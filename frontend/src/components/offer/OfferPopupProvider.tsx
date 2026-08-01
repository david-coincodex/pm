'use client';

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { OfferInfo, CrossSellSite } from './types';

export type { OfferInfo, CrossSellSite } from './types';

// Kept out of the initial chunk: the popup only ever renders after a click, and it
// is never SSR-relevant. Previously it was mounted (closed) on every page.
const UpsellPopup = dynamic(() => import('@/components/site/UpsellPopup'), { ssr: false });

const OfferPopupContext = createContext<{ openOffer: (offer: OfferInfo) => void }>({
  openOffer: () => {},
});

export const useOfferPopup = () => useContext(OfferPopupContext);

export default function OfferPopupProvider({ children }: { children: ReactNode }) {
  const [offer, setOffer] = useState<OfferInfo | null>(null);
  const [featured, setFeatured] = useState<CrossSellSite[]>([]);
  // Once true, the popup stays mounted with `open` toggling instead of being
  // unmounted on close — PopoverSheet animates out over 200ms after `open` flips
  // false, and unmounting immediately would cut that exit animation short.
  const [hasOpened, setHasOpened] = useState(false);
  const crossSellRequested = useRef(false);

  const openOffer = useCallback((o: OfferInfo) => {
    setOffer(o);
    setHasOpened(true);
    // Fetch the cross-sell list once, on first open. It is only read after the user
    // answers the popup's question, so it does not need to be ready before paint.
    if (!crossSellRequested.current) {
      crossSellRequested.current = true;
      fetch('/api/featured')
        .then((res) => (res.ok ? res.json() : []))
        .then((data: CrossSellSite[]) => setFeatured(Array.isArray(data) ? data : []))
        .catch(() => setFeatured([]));
    }
  }, []);

  return (
    <OfferPopupContext.Provider value={{ openOffer }}>
      {children}
      {hasOpened && (
        <UpsellPopup
          offer={offer}
          featured={featured}
          open={offer !== null}
          onClose={() => setOffer(null)}
        />
      )}
    </OfferPopupContext.Provider>
  );
}
