import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';
import { accountsDisabled } from '@/lib/authApi';

/** Clears the auth cookie. Strapi JWTs are stateless — expiry handles the token itself. */
export async function POST() {
  const disabled = accountsDisabled();
  if (disabled) return disabled;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
