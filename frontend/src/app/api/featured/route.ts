import { NextResponse } from 'next/server';
import { getCrossSellSites } from '@/lib/crossSell';

/**
 * Cross-sell sites for the offer popup, fetched lazily by OfferPopupProvider the
 * first time a popup opens. Returns the compact CrossSellSite[] shape rather than
 * the raw Strapi featured payload.
 */
export async function GET() {
  try {
    return NextResponse.json(await getCrossSellSites());
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
