import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getOfferById } from '@/lib/strapi';
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

  return <OfferRedirect offer={offer} />;
}
