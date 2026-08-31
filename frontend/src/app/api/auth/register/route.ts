import { NextRequest, NextResponse } from 'next/server';
import { AUTH_STRAPI_URL, setAuthCookie } from '@/lib/auth';
import { siteSettings } from '@/lib/siteSettings';

/**
 * BFF register: proxies Strapi users-permissions and moves the JWT into an httpOnly cookie.
 * Strapi's own rate limiting (5/5min per IP+email) applies behind this.
 */
export async function POST(req: NextRequest) {
  if (!siteSettings.features.accounts) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }

  const res = await fetch(`${AUTH_STRAPI_URL}/api/auth/local/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Email-only accounts: Strapi's user schema requires a username, so it mirrors the email.
    body: JSON.stringify({ username: email, email, password }),
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data?.error?.message ?? 'Registration failed' }, { status: res.status });
  }

  // With email confirmation enabled Strapi returns user-only (no jwt) — the account exists
  // but must be confirmed before login. The client shows the "check your email" state.
  const response = NextResponse.json({ user: data.user, confirmed: Boolean(data.jwt) });
  if (data.jwt) setAuthCookie(response, data.jwt);
  return response;
}
