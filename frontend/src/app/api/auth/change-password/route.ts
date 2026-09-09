import { NextResponse, type NextRequest } from 'next/server';
import { getJwt, setAuthCookie } from '@/lib/auth';
import { passwordProblem } from '@/lib/accountPolicy';
import { accountsDisabled, clientIp, fail, mapStrapiError, readJson, strapiAuth } from '@/lib/authApi';

/**
 * Change the password of an account that already has one (stock
 * `POST /api/auth/change-password`, which requires the current password — that requirement is
 * the reason set-password is a separate, tightly gated route rather than this one relaxed).
 *
 * Stock returns a fresh JWT, so the cookie is replaced: a password change is exactly when a
 * visitor expects their session to be re-established rather than silently reusing the old
 * token.
 */
export async function POST(req: NextRequest) {
  const disabled = accountsDisabled();
  if (disabled) return disabled;

  const jwt = await getJwt();
  if (!jwt) return fail('unauthorized', 401);

  const body = await readJson<{ currentPassword?: unknown; password?: unknown }>(req);
  if (!body || typeof body.currentPassword !== 'string' || !body.currentPassword) return fail('bad_request', 400);
  const problem = passwordProblem(body.password);
  if (problem === 'required') return fail('password_required', 400);
  if (problem === 'too_short') return fail('password_too_short', 400);

  const result = await strapiAuth('/api/auth/change-password', {
    body: {
      currentPassword: body.currentPassword,
      password: body.password,
      passwordConfirmation: body.password,
    },
    jwt,
    ip: clientIp(req),
  });
  if (!result.ok || !result.data.jwt) {
    // A wrong current password surfaces as the plugin's "The provided current password is
    // invalid", which mapStrapiError turns into `wrong_password` (not the length error).
    return fail(result.ok ? 'upstream' : mapStrapiError(result), result.ok ? 502 : result.status);
  }

  const response = NextResponse.json({ ok: true });
  setAuthCookie(response, result.data.jwt);
  return response;
}
