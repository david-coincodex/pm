import { NextRequest, NextResponse } from 'next/server';
import { AUTH_STRAPI_URL, setAuthCookie } from '@/lib/auth';
import { siteSettings } from '@/lib/siteSettings';

/** BFF login: Strapi /api/auth/local (identifier = email or username). */
export async function POST(req: NextRequest) {
  if (!siteSettings.features.accounts) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let body: { identifier?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (!body.identifier || !body.password) {
    return NextResponse.json({ error: 'identifier and password are required' }, { status: 400 });
  }

  const res = await fetch(`${AUTH_STRAPI_URL}/api/auth/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: body.identifier, password: body.password }),
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok || !data.jwt) {
    return NextResponse.json({ error: data?.error?.message ?? 'Login failed' }, { status: res.ok ? 500 : res.status });
  }

  const response = NextResponse.json({ user: data.user });
  setAuthCookie(response, data.jwt);
  return response;
}
