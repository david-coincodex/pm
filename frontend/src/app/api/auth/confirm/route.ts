import { NextResponse, type NextRequest } from 'next/server';
import { setAuthCookie } from '@/lib/auth';
import { accountsDisabled, clientIp, fail, mapStrapiError, readJson, strapiAuth } from '@/lib/authApi';

/**
 * Step 2 of signup: redeem the token from the confirmation email.
 *
 * The CMS route this calls is ours only in the sense that it delegates to the stock
 * controller with `returnUser` on, so confirming yields `{ jwt, user }` instead of a 302 —
 * the visitor is logged in the moment they prove they own the address, which is what lets
 * step 3 set a password without asking for one they have never been told.
 *
 * `next` tells the page whether to show the password step: a confirmation can also arrive
 * from an account that already has a password (a re-sent link clicked late), and that user
 * should just land logged in.
 */
export async function POST(req: NextRequest) {
  const disabled = accountsDisabled();
  if (disabled) return disabled;

  const body = await readJson<{ confirmation?: unknown }>(req);
  if (!body || typeof body.confirmation !== 'string' || !body.confirmation) return fail('bad_request', 400);

  const result = await strapiAuth(
    `/api/account/confirm-email?confirmation=${encodeURIComponent(body.confirmation)}`,
    { method: 'GET', ip: clientIp(req) },
  );
  if (!result.ok || !result.data.jwt) {
    // A used or forged token is the common case here, and the plugin answers 400 for both.
    return fail(result.ok ? 'upstream' : mapStrapiError(result), result.ok ? 502 : result.status);
  }

  const response = NextResponse.json({
    next: result.data.user?.passwordSet ? 'done' : 'set_password',
    email: result.data.user?.email ?? null,
  });
  setAuthCookie(response, result.data.jwt);
  return response;
}
