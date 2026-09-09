import { NextResponse, type NextRequest } from 'next/server';
import { setAuthCookie } from '@/lib/auth';
import { looksLikeEmail, normalizeEmail } from '@/lib/accountPolicy';
import { accountsDisabled, clientIp, fail, mapStrapiError, readJson, strapiAuth } from '@/lib/authApi';

/**
 * BFF login over stock `POST /api/auth/local`.
 *
 * No captcha here — the CMS rate-limits this route per IP (which only works because we
 * forward the client IP; see `clientIp`), and a challenge on every sign-in taxes the people
 * who are not attacking us. Add one if the buckets turn out not to be enough.
 */
export async function POST(req: NextRequest) {
  const disabled = accountsDisabled();
  if (disabled) return disabled;

  const body = await readJson<{ identifier?: unknown; password?: unknown }>(req);
  if (!body || typeof body.identifier !== 'string' || typeof body.password !== 'string') {
    return fail('bad_request', 400);
  }
  if (!body.identifier || !body.password) return fail('bad_request', 400);

  // Accounts are stored under the normalized address, so `you+tag@gmail.com` and
  // `y.ou@gmail.com` sign in to the one account they created. Anything that isn't shaped like
  // an email is passed through untouched — Strapi also accepts a username as the identifier.
  const identifier = looksLikeEmail(body.identifier.trim().toLowerCase())
    ? normalizeEmail(body.identifier)
    : body.identifier;

  const result = await strapiAuth('/api/auth/local', {
    body: { identifier, password: body.password },
    ip: clientIp(req),
  });
  if (!result.ok || !result.data.jwt) {
    // `unconfirmed` is the one the UI acts on: it offers to re-send the confirmation email.
    return fail(result.ok ? 'upstream' : mapStrapiError(result), result.ok ? 502 : result.status);
  }

  const response = NextResponse.json({ ok: true });
  setAuthCookie(response, result.data.jwt);
  return response;
}
