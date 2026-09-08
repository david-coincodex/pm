import { NextResponse, type NextRequest } from 'next/server';
import { getJwt } from '@/lib/auth';
import { passwordProblem } from '@/lib/accountPolicy';
import { accountsDisabled, clientIp, fail, mapStrapiError, readJson, strapiAuth } from '@/lib/authApi';

/**
 * Step 3 of signup, and the "add a password" action for Google accounts.
 *
 * No current password is asked for because there isn't one to know: the account either just
 * confirmed its address (registration set a random password) or was created by Google. The
 * CMS enforces exactly that — `passwordSet` false or a non-local provider — so a session
 * alone cannot overwrite the password of an account whose owner chose one. Those go through
 * change-password, which demands the current password.
 */
export async function POST(req: NextRequest) {
  const disabled = accountsDisabled();
  if (disabled) return disabled;

  const jwt = await getJwt();
  if (!jwt) return fail('unauthorized', 401);

  const body = await readJson<{ password?: unknown }>(req);
  if (!body) return fail('bad_request', 400);
  const problem = passwordProblem(body.password);
  if (problem === 'required') return fail('password_required', 400);
  if (problem === 'too_short') return fail('password_too_short', 400);

  const result = await strapiAuth('/api/account/set-password', {
    body: { password: body.password },
    jwt,
    ip: clientIp(req),
  });
  if (!result.ok) return fail(mapStrapiError(result), result.status === 502 ? 502 : result.status);

  // The JWT is stateless and unaffected by a password change, so the existing cookie stays
  // valid — nothing to re-issue here.
  return NextResponse.json({ ok: true });
}
