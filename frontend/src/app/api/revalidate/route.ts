import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

/** Constant-time comparison so the secret can't be probed byte-by-byte via timing. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Strapi webhook target. Busts the Next.js fetch cache when content is published,
 * so edits show up immediately instead of after the revalidate window — and the
 * "restart the frontend container to see a DB change" workaround is no longer needed.
 *
 * Wire it up in Strapi admin -> Settings -> Webhooks:
 *   URL     http://frontend:3002/api/revalidate/   (both services share the
 *                                                   `internal` docker network)
 *   Header  x-revalidate-secret: <REVALIDATE_SECRET>
 *   Events  entry.create/update/delete/publish/unpublish + media.*
 *
 * Note the trailing slash: next.config sets `trailingSlash: true`, so the
 * slash-less URL answers 308. A 308 does preserve the POST method and body, so
 * either form works with a client that follows redirects — but pointing the
 * webhook straight at the canonical URL avoids the extra round trip.
 *
 * Deliberately coarse: it busts the whole `strapi` tag rather than per-collection
 * tags. Collection tags are emitted by strapiGet so we *can* get selective later,
 * but leading with them would be wrong — offers, platforms and sales are read
 * almost entirely nested inside /sites, /bundles and /reviews responses, so an
 * offer-price edit would have to bust four tags to actually be correct. A full
 * bust is ~60 re-fetches of 20-140ms, spread lazily across later requests.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;

  // No configured secret means the endpoint is closed, not open.
  if (!secret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }
  if (!secretsMatch(req.headers.get('x-revalidate-secret') ?? '', secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Body is informational only (Strapi sends { event, model, entry, ... }) and is
  // not required — a webhook with no/invalid body should still invalidate.
  const body = await req.json().catch(() => null);

  // Next 16 requires a cache-life profile as the second argument; single-arg
  // revalidateTag is deprecated, and `updateTag` is Server-Action-only. 'max' lets
  // entries be served stale while they revalidate rather than stalling requests.
  revalidateTag('strapi', 'max');

  return NextResponse.json({
    revalidated: true,
    tag: 'strapi',
    model: body?.model ?? null,
    event: body?.event ?? null,
  });
}
