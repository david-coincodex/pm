import { NextResponse } from 'next/server';
import { getFeaturedDeals } from '@/lib/strapi';

export async function GET() {
  try {
    const deals = await getFeaturedDeals();
    return NextResponse.json(deals);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
