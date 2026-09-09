import { NextResponse, type NextRequest } from 'next/server';
import { looksLikeEmail, normalizeEmail } from '@/lib/accountPolicy';
import { verifyCaptcha } from '@/lib/turnstile';
import { accountsDisabled, clientIp, fail, readJson, strapiAuth } from '@/lib/authApi';

/**
 * Request a password-reset email (stock `POST /api/auth/forgot-password`, whose link target
 * is the seeded `email_reset_password` → our /account/reset-password page).
 *
 * ALWAYS answers ok. Whether an address has an account is not something this endpoint should
 * reveal — the difference between "sent" and "no such user" is a free account-enumeration
 * oracle — so the only failures it reports are the ones the caller already knows about
 * (malformed input, failed captcha) plus rate limiting.
 */
export async function POST(req: NextRequest) {
  const disabled = accountsDisabled();
  if (disabled) return disabled;

  const body = await readJson<{ email?: unknown; captchaToken?: unknown }>(req);
  if (!body || typeof body.email !== 'string') return fail('bad_request', 400);

  const email = normalizeEmail(body.email);
  if (!looksLikeEmail(email)) return fail('email_invalid', 400);

  const ip = clientIp(req);
  if (!(await verifyCaptcha(body.captchaToken, ip))) return fail('captcha', 400);

  const result = await strapiAuth('/api/auth/forgot-password', { body: { email }, ip });
  if (result.status === 429) return fail('rate_limited', 429);

  return NextResponse.json({ ok: true });
}
