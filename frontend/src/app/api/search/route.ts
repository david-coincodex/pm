import { NextRequest, NextResponse } from 'next/server';
import { searchSites, type Site } from '@/lib/strapi';

export type SearchResult = {
  id: string;
  name: string;
  slug: string;
  parentSlug?: string;
  price?: number;
  fullPrice?: number | null;
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) {
    return NextResponse.json([]);
  }
  try {
    const sites = await searchSites(q);

    const results: SearchResult[] = [];

    for (const site of sites) {
      // Use own offers, fall back to parent site offers for child sites
      const ownOffers = (site.offers ?? []).filter((o) => o.isActive);
      const parentOffers = (site.parent_site as Site | undefined)?.offers ?? [];
      const effectiveOffers = ownOffers.length > 0 ? ownOffers : parentOffers.filter((o) => o.isActive);
      const best = effectiveOffers.length > 0
        ? [...effectiveOffers].sort((a, b) => a.price - b.price)[0]
        : undefined;
      results.push({
        id: `site-${site.id}`,
        name: site.name,
        slug: site.slug,
        parentSlug: site.parent_site?.slug ?? undefined,
        price: best?.price,
        fullPrice: best?.full_price,
      });
    }

    return NextResponse.json(results);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
