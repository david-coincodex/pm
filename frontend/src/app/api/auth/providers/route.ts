import { NextResponse } from 'next/server';
import { STRAPI_FETCH_URL, cfAccessHeaders } from '@/lib/strapi';
import { accountsDisabled } from '@/lib/authApi';

/**
 * Which sign-in providers the CMS has enabled, for the account popup.
 *
 * The CMS is the single source of truth: Google is turned on either by `GOOGLE_CLIENT_ID` in
 * the backend environment or in **Settings → Users & Permissions plugin → Providers**, and
 * either way this reports it. That is what lets the admin panel actually control the button —
 * before, the frontend carried its own `NEXT_PUBLIC_GOOGLE_SIGNIN` build arg, so enabling the
 * provider in Strapi changed nothing on the site until the image was rebuilt.
 *
 * The UPSTREAM read is cached for a minute — long enough that opening the popup does not hit
 * the CMS every time, short enough that flipping the provider in the admin panel shows up
 * while the person who flipped it is still looking. The client id it returns is public by
 * construction: it travels in every OAuth authorization URL.
 *
 * The ROUTE itself is dynamic on purpose. Left to itself Next prerendered it at build time,
 * which meant asking a CMS that does not exist on a CI runner and baking "Google is off" into
 * the image — the same shape of bug as the build-arg flag this replaced.
 */
export const dynamic = 'force-dynamic';
const UPSTREAM_REVALIDATE = 60;

export async function GET() {
  const disabled = accountsDisabled();
  if (disabled) return disabled;

  try {
    const res = await fetch(`${STRAPI_FETCH_URL}/api/account/auth-providers`, {
      headers: cfAccessHeaders(),
      next: { revalidate: UPSTREAM_REVALIDATE },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`cms ${res.status}`);
    const data = (await res.json()) as { google?: { enabled?: boolean; clientId?: string } };
    return NextResponse.json({
      google: { enabled: Boolean(data.google?.enabled), clientId: data.google?.clientId ?? '' },
    });
  } catch (err) {
    // A CMS hiccup must not break the popup: report "no providers" and the email form still
    // works. Logged, because a permanently missing Google button is otherwise a silent mystery.
    console.error('[auth] provider lookup failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ google: { enabled: false, clientId: '' } });
  }
}
