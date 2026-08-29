import type { ReactNode } from 'react';
import CamThumbHead from '@/components/cams/CamThumbHead';
import CamFreshness from '@/components/cams/CamFreshness';

/**
 * Shared support for the whole browse surface: thumbnail warmup + broken-image fallback
 * (CamThumbHead) and the keep-open-tabs-live refresher (CamFreshness).
 */
export default function LiveSexLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CamThumbHead />
      <CamFreshness />
      {children}
    </>
  );
}
