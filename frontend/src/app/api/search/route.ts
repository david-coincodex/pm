import { NextRequest, NextResponse } from 'next/server';
import { searchSites, searchSubsites } from '@/lib/strapi';

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
    const [sites, subsites] = await Promise.all([
      searchSites(q),
      searchSubsites(q),
    ]);

    const results: SearchResult[] = [];

    for (const site of sites) {
      const activeOffers = (site.offers ?? []).filter((o) => o.isActive);
      const best = activeOffers.length > 0
        ? [...activeOffers].sort((a, b) => a.price - b.price)[0]
        : undefined;
      results.push({
        id: `site-${site.id}`,
        name: site.name,
        slug: site.slug,
        price: best?.price,
        fullPrice: best?.full_price,
      });
    }

    for (const sub of subsites) {
      // Skip if parent site already in results
      if (results.some((r) => r.slug === sub.site?.slug)) continue;
      const parentOffers = ((sub.site as any)?.offers ?? []).filter((o: any) => o.isActive);
      const best = parentOffers.length > 0
        ? [...parentOffers].sort((a: any, b: any) => a.price - b.price)[0]
        : undefined;
      results.push({
        id: `sub-${sub.id}`,
        name: sub.name,
        slug: sub.slug,
        parentSlug: sub.site?.slug,
        price: best?.price,
        fullPrice: best?.full_price,
      });
    }

    return NextResponse.json(results);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
