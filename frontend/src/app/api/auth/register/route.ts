import { NextResponse, type NextRequest } from 'next/server';
import { setAuthCookie } from '@/lib/auth';
import { looksLikeEmail, normalizeEmail } from '@/lib/accountPolicy';
import { checkEmail } from '@/lib/emailPolicy';
import { verifyCaptcha } from '@/lib/turnstile';
import { accountsDisabled, clientIp, fail, mapStrapiError, placeholderPassword, readJson, strapiAuth } from '@/lib/authApi';

/**
 * Step 1 of signup: an email address, nothing else.
 *
 * The account is created immediately (stock `POST /api/auth/local/register`) with a random
 * password the visitor never learns, which is what lets step 3 offer "choose your password"
 * to someone who has just proved they own the address. Strapi requires a username, so it
 * mirrors the normalized email.
 *
 * The response tells the client which step comes next rather than the client guessing:
 *  - `check_email` — confirmation is on (SMTP configured): Strapi has sent the link.
 *  - `set_password` — confirmation is off, so registration already returned a session; the
 *    popup collects the password inline instead of after an email round trip.
 */
export async function POST(req: NextRequest) {
  const disabled = accountsDisabled();
  if (disabled) return disabled;

  const body = await readJson<{ email?: unknown; captchaToken?: unknown }>(req);
  if (!body || typeof body.email !== 'string') return fail('bad_request', 400);

  const email = normalizeEmail(body.email);
  if (!looksLikeEmail(email)) return fail('email_invalid', 400);

  const ip = clientIp(req);
  // Captcha BEFORE the DNS lookup and before any CMS call, so a flood costs an attacker a
  // solved challenge rather than costing us a resolver round trip per attempt.
  if (!(await verifyCaptcha(body.captchaToken, ip))) return fail('captcha', 400);

  const rejection = await checkEmail(email);
  if (rejection === 'invalid') return fail('email_invalid', 400);
  if (rejection === 'disposable') return fail('email_disposable', 400);
  if (rejection === 'no_mx') return fail('email_unreachable', 400);

  const result = await strapiAuth('/api/auth/local/register', {
    body: { username: email, email, password: placeholderPassword() },
    ip,
  });

  if (!result.ok) {
    const code = mapStrapiError(result);
    // "This address already has an account" must NOT come back as an error: answering
    // differently for a taken address turns signup into an account-existence oracle, and on
    // an adult site that is worse than the usual leak — "does this person have an account
    // here" is itself sensitive, and anyone can ask the question about anyone.
    //
    // So the response is byte-identical to a fresh signup and the DIFFERENCE MOVES INTO THE
    // MAILBOX, where only its owner can see it. The real owner gets a mail they can act on;
    // whoever typed the address learns nothing either way.
    if (code === 'email_taken') {
      await notifyExistingAccount(email, ip);
      return NextResponse.json({ next: 'check_email', email });
    }
    return fail(code, result.status === 502 ? 502 : result.status);
  }

  if (result.data.jwt) {
    // No mailer configured: registration already returned a session, so the password step
    // happens inline. NOTE this is also the one case where a taken address is still
    // distinguishable (session vs "check your email") — enumeration protection needs a
    // working mailer, which is the same condition that makes email confirmation possible.
    const response = NextResponse.json({ next: 'set_password', email });
    setAuthCookie(response, result.data.jwt);
    return response;
  }
  return NextResponse.json({ next: 'check_email', email });
}

/**
 * Hand the fact off to the CMS, which mails the account's owner — a "someone tried to sign up
 * with your address, nothing changed" notice, or the confirmation link again if the account
 * was never confirmed. It decides; we are not told which, and neither is the visitor.
 *
 * The result is ignored on purpose: if the caller's answer varied with what happened in here,
 * the variation would be the oracle we just removed.
 */
async function notifyExistingAccount(email: string, ip: string | null): Promise<void> {
  await strapiAuth('/api/account/notify-signup-attempt', { body: { email }, ip });
}
