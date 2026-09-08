import { NextResponse, type NextRequest } from 'next/server';
import { looksLikeEmail, normalizeEmail } from '@/lib/accountPolicy';
import { verifyCaptcha } from '@/lib/turnstile';
import { accountsDisabled, clientIp, fail, readJson, strapiAuth } from '@/lib/authApi';

/**
 * Re-send the confirmation email (stock `POST /api/auth/send-email-confirmation`) — the exit
 * from the one dead end in the flow: an account created but never confirmed, whose link has
 * been lost or has expired.
 *
 * Answers ok whatever happened upstream, for the same enumeration reason as forgot-password:
 * stock rejects an already-confirmed or unknown address with a distinguishable error, and
 * that difference is exactly what must not be observable.
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

  const result = await strapiAuth('/api/auth/send-email-confirmation', { body: { email }, ip });
  if (result.status === 429) return fail('rate_limited', 429);

  return NextResponse.json({ ok: true });
}
