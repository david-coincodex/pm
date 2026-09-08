import { NextResponse, type NextRequest } from 'next/server';
import { setAuthCookie } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { accountsDisabled, clientIp, mapStrapiError, strapiAuth } from '@/lib/authApi';

/**
 * The browser's landing point after Google sign-in.
 *
 * The whole hop chain is stock: the button links to `<CMS>/api/connect/google`, Strapi hands
 * off to Google, Google returns to `<CMS>/api/connect/google/callback`, and Strapi redirects
 * the browser HERE with a short-lived provider access token (the `grant.google.callback`
 * seeded at CMS bootstrap). We exchange that token for a Strapi JWT server-side, so the
 * session token itself never touches the URL bar, browser history, or client JavaScript.
 *
 * A redirect, not JSON: this is a top-level navigation the visitor is watching.
 *
 * Note on identity: Strapi creates google users with the address Google reports, so our email
 * normalization cannot apply here. Google never issues plus-aliased primary addresses, which
 * leaves gmail dot-variants as the only way to end up with two accounts for one mailbox —
 * accepted, and cheaper than second-guessing the provider's canonical form.
 */
export async function GET(req: NextRequest) {
  const disabled = accountsDisabled();
  if (disabled) return disabled;

  /**
   * RELATIVE redirects (RFC 7231 §7.1.2 allows them), not `NextResponse.redirect(new URL(…,
   * req.url))`: behind Traefik + Cloudflare the request Next sees is plain HTTP on an internal
   * host, so an absolute URL derived from it can send the browser to `http://` — an extra hop
   * at best, and a cookie set over a downgraded scheme at worst. A path-only Location is
   * resolved by the browser against the address bar, which is always the real one.
   */
  const redirect = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } });
  /**
   * Failures go back to the sign-in POPUP, which is the only sign-in surface there is: the
   * home page with `?auth=login&error=…`, which AuthModalProvider picks up (and then wipes
   * from the address bar). Built here rather than through `routes.login()` because that
   * helper already carries a query string, and appending a second `?` would produce nonsense.
   */
  const authUrl = (error: string) =>
    `${getPathname({ href: routes.home(), locale: routing.defaultLocale })}?auth=login&error=${encodeURIComponent(error)}`;

  const accessToken = req.nextUrl.searchParams.get('access_token');
  if (!accessToken) return redirect(authUrl('google'));

  const result = await strapiAuth(
    `/api/auth/google/callback?access_token=${encodeURIComponent(accessToken)}`,
    { method: 'GET', ip: clientIp(req) },
  );
  if (!result.ok || !result.data.jwt) {
    // The interesting case is `email_taken`: this address already has an email+password
    // account, and stock connect refuses to link the two. The popup turns that code into
    // "you already have an account — sign in with your password".
    const code = result.ok ? 'google' : mapStrapiError(result);
    console.warn('[auth] google callback failed:', result.status, code);
    return redirect(authUrl(code));
  }

  const response = redirect(getPathname({ href: routes.favorites(), locale: routing.defaultLocale }));
  setAuthCookie(response, result.data.jwt);
  return response;
}
