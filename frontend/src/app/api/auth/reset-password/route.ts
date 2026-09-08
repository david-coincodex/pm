import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { setAuthCookie } from '@/lib/auth';
import { RESET_COOKIE } from '../reset-link/route';
import { passwordProblem } from '@/lib/accountPolicy';
import { accountsDisabled, clientIp, fail, mapStrapiError, readJson, strapiAuth } from '@/lib/authApi';

/**
 * Complete a password reset with the emailed code (stock `POST /api/auth/reset-password`),
 * then log the visitor straight in — they have just proved mailbox ownership, so bouncing
 * them to a login form would be theatre.
 */
export async function POST(req: NextRequest) {
  const disabled = accountsDisabled();
  if (disabled) return disabled;

  const body = await readJson<{ code?: unknown; password?: unknown }>(req);
  if (!body) return fail('bad_request', 400);
  /**
   * The code comes from the httpOnly cookie the reset LINK parked there, so it never travelled
   * through the browser's URL or the form. A body-supplied code is still accepted for reset
   * emails sent before that change — those links carry it in the query string.
   */
  const cookieCode = (await cookies()).get(RESET_COOKIE)?.value;
  const code = cookieCode ?? (typeof body.code === 'string' ? body.code : '');
  if (!code) return fail('invalid_code', 400);
  const problem = passwordProblem(body.password);
  if (problem === 'required') return fail('password_required', 400);
  if (problem === 'too_short') return fail('password_too_short', 400);

  const ip = clientIp(req);
  const result = await strapiAuth('/api/auth/reset-password', {
    body: { code, password: body.password, passwordConfirmation: body.password },
    ip,
  });
  if (!result.ok || !result.data.jwt) {
    return fail(result.ok ? 'upstream' : mapStrapiError(result), result.ok ? 502 : result.status);
  }

  /**
   * An account that never confirmed its address cannot be handed a session: while email
   * confirmation is on, the CMS's JWT strategy rejects EVERY authenticated call from an
   * unconfirmed user, so "logging them in" here would produce a cookie that fails on the next
   * request. Stock reset doesn't set `confirmed` and we cannot set it for them either — that
   * flag is what the confirmation link is for.
   *
   * The password they just chose IS saved, so the way out is the confirmation link: re-send it
   * and say so. Clicking it confirms the address and signs them in, with the new password
   * already in place. (This is the tail of the one real dead end in the flow: someone who
   * registered by email, never clicked confirm, and later tried to recover with "forgot
   * password" instead of finding that first mail.)
   */
  if (result.data.user?.confirmed === false) {
    await strapiAuth('/api/auth/send-email-confirmation', { body: { email: result.data.user.email }, ip });
    const pending = NextResponse.json({ next: 'check_email' });
    pending.cookies.set(RESET_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    return pending;
  }

  /**
   * Make the new password actually usable. Stock forgot/reset don't look at `provider`, so a
   * Google-created account can reset "successfully" and still be refused by /auth/local,
   * which only accepts local accounts — the visitor would be left with a password that does
   * nothing. The same follow-up also stamps `passwordSet` on an account that reset instead of
   * finishing signup, which is what closes the set-password route for it afterwards.
   *
   * Best-effort: the reset itself already succeeded, so a failure here is logged rather than
   * turned into an error the visitor cannot act on. (Converting a Google account to
   * email+password sign-in is stated in the UI before they start.)
   */
  const user = result.data.user;
  if (user && (user.provider !== 'local' || user.passwordSet !== true)) {
    const flip = await strapiAuth('/api/account/set-password', {
      body: { password: body.password },
      jwt: result.data.jwt,
      ip,
    });
    if (!flip.ok) console.error('[auth] reset provider flip failed for user', user.id, flip.status);
  }

  const response = NextResponse.json({ next: 'done' });
  setAuthCookie(response, result.data.jwt);
  // The code is spent: drop it so a shared browser is not left holding a usable one.
  response.cookies.set(RESET_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
