import { NextRequest, NextResponse } from 'next/server';
import { authHeaders, getFavorites, AUTH_STRAPI_URL } from '@/lib/auth';
import { siteSettings } from '@/lib/siteSettings';

/**
 * BFF over api::cam-favorite. Ownership is enforced by the Strapi controller from the JWT —
 * this layer only moves the httpOnly cookie into a Bearer header.
 */

export async function GET() {
  if (!siteSettings.features.accounts) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ favorites: await getFavorites() });
}

export async function POST(req: NextRequest) {
  if (!siteSettings.features.accounts) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const headers = await authHeaders();
  if (!headers) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  // Field allowlist — the Strapi controller sanitizes too, but a BFF should never forward
  // arbitrary client JSON into a write.
  const data = {
    provider: body.provider,
    username: body.username,
    displayName: body.displayName,
    thumbUrl: body.thumbUrl,
    gender: body.gender,
  };
  const res = await fetch(`${AUTH_STRAPI_URL}/api/cam-favorites`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}

export async function DELETE(req: NextRequest) {
  if (!siteSettings.features.accounts) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const headers = await authHeaders();
  if (!headers) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  const documentId = req.nextUrl.searchParams.get('documentId');
  if (!documentId || !/^[a-z0-9]+$/.test(documentId)) {
    return NextResponse.json({ error: 'documentId required' }, { status: 400 });
  }
  const res = await fetch(`${AUTH_STRAPI_URL}/api/cam-favorites/${documentId}`, {
    method: 'DELETE',
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
