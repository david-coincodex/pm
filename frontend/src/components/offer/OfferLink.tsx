'use client';

import { type ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';
import { routes } from '@/lib/routes';
import { useOfferPopup } from './OfferPopupProvider';
import type { OfferInfo } from './types';

/**
 * Shared link to an /offer/<id>/ redirect. Renders a real crawlable <a> that opens the
 * redirect in a new tab (unchanged affiliate behaviour) and, on click, opens the shared
 * offer popup with this offer's details. Use this everywhere instead of a raw <Link href=
 * {routes.offer(id)}> so the popup fires on every offer click.
 */
export default function OfferLink({
  offer,
  className,
  children,
}: {
  offer: OfferInfo;
  className?: string;
  children: ComponentProps<typeof Link>['children'];
}) {
  const { openOffer } = useOfferPopup();
  return (
    <Link
      href={routes.offer(offer.id)}
      target="_blank"
      rel="nofollow noopener noreferrer"
      onClick={() => openOffer(offer)}
      className={className}
    >
      {children}
    </Link>
  );
}
