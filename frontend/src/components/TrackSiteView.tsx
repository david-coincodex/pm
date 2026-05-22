'use client';

import { useEffect } from 'react';
import { trackView, type RecentItem } from '@/hooks/useRecentlyViewed';

export default function TrackSiteView({ site }: { site: RecentItem }) {
  useEffect(() => {
    trackView(site);
  }, [site]);
  return null;
}
