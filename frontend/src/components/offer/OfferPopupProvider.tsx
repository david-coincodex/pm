'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import UpsellPopup from '@/components/site/UpsellPopup';
import type { OfferInfo, CrossSellSite } from './types';

export type { OfferInfo, CrossSellSite } from './types';

const OfferPopupContext = createContext<{ openOffer: (offer: OfferInfo) => void }>({
  openOffer: () => {},
});

export const useOfferPopup = () => useContext(OfferPopupContext);

export default function OfferPopupProvider({
  children,
  featured,
}: {
  children: ReactNode;
  featured: CrossSellSite[];
}) {
  const [offer, setOffer] = useState<OfferInfo | null>(null);
  const openOffer = useCallback((o: OfferInfo) => setOffer(o), []);

  return (
    <OfferPopupContext.Provider value={{ openOffer }}>
      {children}
      <UpsellPopup
        offer={offer}
        featured={featured}
        open={offer !== null}
        onClose={() => setOffer(null)}
      />
    </OfferPopupContext.Provider>
  );
}
