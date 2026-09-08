import 'server-only';

/**
 * Cloudflare Turnstile verification for the endpoints that create accounts or send mail.
 *
 * Turnstile over reCAPTCHA/hCaptcha: the stack is already behind Cloudflare, the managed
 * widget is usually invisible to real visitors, it is free at our volume, and — unlike
 * Google's — its terms don't exclude adult sites.
 *
 * OFF unless configured. Both keys unset (the dev default) skips verification entirely; one
 * key without the other is a misconfiguration that would silently disable the captcha in
 * production, so it throws instead.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? '';

if (Boolean(SITE_KEY) !== Boolean(SECRET_KEY)) {
  throw new Error(
    'Turnstile is half-configured: NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must both be set, or both be empty. ' +
      'Remember the site key is a BUILD ARG — a runtime-only value never reaches the browser bundle.',
  );
}

export const CAPTCHA_ENABLED = Boolean(SITE_KEY && SECRET_KEY);

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * True = let the request through.
 *
 * A missing or rejected token fails CLOSED (that is the whole point), but an unreachable
 * Cloudflare fails OPEN: an outage of the captcha service must not take registration down
 * with it, and an attacker cannot cause that state — they don't control our egress. Email
 * confirmation and per-IP rate limiting still apply underneath.
 */
export async function verifyCaptcha(token: unknown, ip: string | null): Promise<boolean> {
  if (!CAPTCHA_ENABLED) return true;
  if (typeof token !== 'string' || token.length === 0) return false;

  const form = new URLSearchParams({ secret: SECRET_KEY, response: token });
  if (ip) form.set('remoteip', ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return true; // transport-level failure → fail open (see above)
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (!data.success) {
      console.warn('[turnstile] rejected:', data['error-codes']?.join(',') ?? 'unknown');
      return false;
    }
    return true;
  } catch {
    return true;
  }
}
