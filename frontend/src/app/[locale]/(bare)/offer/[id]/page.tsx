import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getOfferById } from '@/lib/strapi';
import { trackServerEvent } from '@/lib/serverAnalytics';
import OfferRedirect from '@/components/offer/OfferRedirect';

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const offer = await getOfferById(Number(id));
  if (!offer) return {};
  const t = await getTranslations({ locale, namespace: 'offer' });
  return {
    title: offer.site.name,
    description: t('redirecting'),
    robots: { index: false },
  };
}

export default async function OfferPage({ params }: Props) {
  const { id } = await params;
  const offer = await getOfferById(Number(id));
  if (!offer) notFound();

  // Server-side so ad blockers cannot drop it — this is the affiliate funnel's only reliable
  // click count. Fires after the response is flushed, so it costs the visitor nothing.
  await trackServerEvent('offer_click', {
    offer_id: offer.id,
    site_slug: offer.site.slug,
    site_name: offer.site.name,
    offer_type: offer.offerType ?? undefined,
    // Not named `value`: GA treats that as revenue, and an offer's sticker price is the
    // visitor's spend at the merchant, not ours.
    offer_price: offer.price,
  });

  return <OfferRedirect offer={offer} />;
}
