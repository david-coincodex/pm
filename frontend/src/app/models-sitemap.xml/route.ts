import type { NextRequest } from 'next/server';
import { siteSettings } from '@/lib/siteSettings';
import { routes } from '@/lib/routes';
import { listKnownModelKeys } from '@/lib/cams/modelDb';
import { staticEntry } from '@/lib/sitemapData';
import { urlsetXml, XML_HEADERS } from '@/lib/sitemapXml';

/**
 * Every model in the persistent cam registry — the SEO surface for ranking on model names.
 * Same filename production's crawl history already knows (the legacy models-sitemap.xml,
 * which shipped empty). lastmod is the model's lastSeenAt: it moves whenever they stream,
 * which is exactly the signal that the page's content (live state, snapshots) moved too.
 * Floored to the hour: the sync bulk-touches lastSeenAt every ~5 minutes for the whole online
 * roster, and a lastmod that always equals fetch time teaches Google to distrust lastmod
 * site-wide. Hourly matches the page's own article:modified_time.
 * The 60-day cleanup cron drops expired models here and 404s their pages in the same stroke.
 *
 * Chunked at 20k URLs per file (the protocol caps a file at 50k; smaller chunks keep each
 * fetch light). Externally the chunks are path-based filenames — /models-sitemap-N.xml — which
 * a next.config rewrite maps onto this handler's ?page=N (path filenames are the sitemap
 * convention / Yoast parity; .xml is excluded from the proxy matcher, so the rewrite can't live
 * in proxy.ts). The chunk children are registered by the sitemap INDEX (app/sitemap.xml), which
 * reads the same cached keys response to count them — a sitemap index may not nest another
 * index, so the chunks hang off the main one directly. The bare URL (no page) serves chunk 1,
 * keeping the legacy URL a valid urlset and the rewrite target.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!siteSettings.features.liveSex) return new Response('Not found', { status: 404 });
  // The chunk arrives one of two ways: ?page=N (direct/legacy) OR the path-based filename
  // /models-sitemap-N.xml. The proxy rewrites the latter to ?page=N, but a route handler reached
  // via a middleware rewrite still sees the ORIGINAL request URL — so searchParams is empty for
  // the path form. Read the path too (it's the handler's own original pathname). Bare URL =
  // chunk 1 (the legacy production filename must stay a valid urlset); anything that isn't a
  // positive integer is junk, and a chunk past the data must 404, not serve an empty urlset.
  const raw =
    req.nextUrl.searchParams.get('page') ??
    req.nextUrl.pathname.match(/^\/models-sitemap-(\d{1,4})\.xml$/)?.[1] ??
    null;
  if (raw !== null && !/^[1-9]\d{0,3}$/.test(raw)) return new Response('Not found', { status: 404 });
  const page = raw === null ? 1 : Number(raw);
  // The backend pages at MODELS_SITEMAP_CHUNK, so one chunk = one bounded request — the
  // registry is far too large to materialize whole (see listKnownModelKeys).
  const { keys } = await listKnownModelKeys(page);
  if (keys.length === 0 && page > 1) return new Response('Not found', { status: 404 });
  const urls = keys.map((m) => {
    const ms = Date.parse(m.lastSeenAt ?? m.updatedAt ?? '');
    return {
      ...staticEntry(routes.camModel(m.provider, m.username)),
      lastModified: Number.isFinite(ms) ? new Date(ms - (ms % 3_600_000)).toISOString() : undefined,
    };
  });
  return new Response(urlsetXml(urls), { headers: XML_HEADERS });
}
