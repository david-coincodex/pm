'use client';

import { createContext, useContext, useState } from 'react';
import type { Crumb } from '@/lib/breadcrumbs';

type BreadcrumbsContextValue = {
  crumbs: Crumb[] | null;
  setCrumbs: (crumbs: Crumb[] | null) => void;
};

const BreadcrumbsContext = createContext<BreadcrumbsContextValue>({
  crumbs: null,
  setCrumbs: () => {},
});

export function BreadcrumbsProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  return (
    <BreadcrumbsContext.Provider value={{ crumbs, setCrumbs }}>
      {children}
    </BreadcrumbsContext.Provider>
  );
}

export function useBreadcrumbsContext() {
  return useContext(BreadcrumbsContext);
}
