import { NextResponse, type NextRequest } from 'next/server';
import { setAuthCookie } from '@/lib/auth';
import { accountsDisabled, clientIp, mapStrapiError, strapiAuth } from '@/lib/authApi';

/**
 * Where the confirmation email's link points.
 *
 * A ROUTE HANDLER rather than a page, which fixes three things at once:
 *
 *  1. **No empty page.** It redeems the token and sends the visitor to the HOME page with the
 *     popup already open — real content behind the card, instead of a bare shell whose only
 *     job was to host a modal.
 *  2. **The token never appears in a page URL.** It arrives here, is spent server-side, and
 *     the visitor's address bar only ever shows `/?auth=…`. Nothing to strip from analytics,
 *     nothing in browser history, nothing to leak as a referrer.
 *  3. **No client round trip.** The old page mounted a component that POSTed the token back to
 *     the server; now the redemption happens before the first byte of HTML.
 *
 * The redirect is RELATIVE (RFC 7231 allows it) so a TLS-terminating proxy cannot downgrade it
 * to http, and 303 so nothing re-posts.
 */
export async function GET(req: NextRequest) {
  const disabled = accountsDisabled();
  if (disabled) return disabled;

  const redirect = (query: string) =>
    new NextResponse(null, { status: 303, headers: { Location: `/?${query}` } });

  const token = req.nextUrl.searchParams.get('confirmation');
  if (!token) return redirect('auth=login&error=invalid_code');

  const result = await strapiAuth(`/api/account/confirm-email?confirmation=${encodeURIComponent(token)}`, {
    method: 'GET',
    ip: clientIp(req),
  });
  if (!result.ok || !result.data.jwt) {
    // A used or expired link is the common case; the popup explains it rather than showing a
    // scary failure.
    return redirect(`auth=login&error=${result.ok ? 'upstream' : mapStrapiError(result)}`);
  }

  // Confirmed AND signed in. Someone who has not chosen a password yet goes straight to that
  // step; anyone who already has one just gets the confirmation.
  const needsPassword = result.data.user?.passwordSet !== true;
  const response = redirect(needsPassword ? 'auth=set-password' : 'auth=confirmed');
  setAuthCookie(response, result.data.jwt);
  return response;
}
