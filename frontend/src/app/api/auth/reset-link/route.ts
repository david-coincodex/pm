import { NextResponse, type NextRequest } from 'next/server';
import { accountsDisabled } from '@/lib/authApi';

/**
 * Where the password-reset email's link points.
 *
 * The reset code cannot be spent here — the visitor still has to type a new password — so this
 * handler PARKS IT IN AN HTTPONLY COOKIE and sends them to the home page with the reset popup
 * open. The code therefore never touches a page URL, browser history, analytics or a referrer
 * header, and the form that uses it never sees it either: `/api/auth/reset-password` reads the
 * cookie server-side.
 *
 * Fifteen minutes is deliberate — long enough to choose a password, short enough that a shared
 * or borrowed browser is not left holding a usable reset code. (Strapi's own token lifetime
 * still applies underneath; this only bounds how long the browser carries it.)
 */
export const RESET_COOKIE = 'pm_reset';
const RESET_COOKIE_MAX_AGE = 15 * 60;

export async function GET(req: NextRequest) {
  const disabled = accountsDisabled();
  if (disabled) return disabled;

  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return new NextResponse(null, { status: 303, headers: { Location: '/?auth=forgot&error=invalid_code' } });
  }

  const response = new NextResponse(null, { status: 303, headers: { Location: '/?auth=reset' } });
  response.cookies.set(RESET_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: RESET_COOKIE_MAX_AGE,
  });
  return response;
}
