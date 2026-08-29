import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';
import { siteSettings } from '@/lib/siteSettings';

/** Clears the auth cookie. Strapi JWTs are stateless — expiry handles the token itself. */
export async function POST() {
  if (!siteSettings.features.accounts) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
