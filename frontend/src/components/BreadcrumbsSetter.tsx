'use client';

import { useEffect, useLayoutEffect } from 'react';
import type { Crumb } from '@/lib/breadcrumbs';
import { useBreadcrumbsContext } from './BreadcrumbsProvider';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function BreadcrumbsSetter({ crumbs }: { crumbs: Crumb[] }) {
  const { setCrumbs } = useBreadcrumbsContext();
  const serialized = JSON.stringify(crumbs);

  useIsomorphicLayoutEffect(() => {
    setCrumbs(crumbs);
    return () => setCrumbs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  return null;
}
