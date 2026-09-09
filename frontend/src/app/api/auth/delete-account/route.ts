import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, getJwt } from '@/lib/auth';
import { accountsDisabled, clientIp, fail, mapStrapiError, readJson, strapiAuth } from '@/lib/authApi';

/**
 * Delete the visitor's own account.
 *
 * The CMS endpoint behind this can only ever delete the caller (`ctx.state.user`) and enforces
 * both gates itself — the typed DELETE keyword and, for accounts that have a password, the
 * password. This handler adds nothing but the session and the cookie cleanup: once the account
 * is gone its JWT refers to a missing user, so leaving the cookie in place would give the
 * browser a token that fails every subsequent request in confusing ways.
 */
export async function POST(req: NextRequest) {
  const disabled = accountsDisabled();
  if (disabled) return disabled;

  const jwt = await getJwt();
  if (!jwt) return fail('unauthorized', 401);

  const body = await readJson<{ confirm?: unknown; password?: unknown }>(req);
  if (!body || body.confirm !== 'DELETE') return fail('bad_request', 400);

  const result = await strapiAuth('/api/account/delete', {
    body: { confirm: 'DELETE', password: typeof body.password === 'string' ? body.password : undefined },
    jwt,
    ip: clientIp(req),
  });
  if (!result.ok) {
    // A wrong password comes back as the plugin-shaped 400; the UI says "that password is
    // wrong" rather than the generic failure, because it is the one thing the visitor can fix.
    const message = (result.data?.error?.message ?? '').toLowerCase();
    const code = message.includes('invalid password') || message.includes('password is required')
      ? 'invalid_credentials'
      : mapStrapiError(result);
    return fail(code, result.status === 502 ? 502 : result.status);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
