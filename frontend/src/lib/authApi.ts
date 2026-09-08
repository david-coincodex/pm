import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { STRAPI_FETCH_URL, cfAccessHeaders } from '@/lib/strapi';
import { siteSettings } from '@/lib/siteSettings';

/**
 * The plumbing every /api/auth/* route repeats: the feature-flag door, the client IP the CMS
 * needs for rate limiting, one configured fetch to Strapi, and the error vocabulary the UI
 * translates. Nine route handlers share it so none of them can quietly drift — in particular
 * none can forget the Cloudflare Access headers or the forwarded IP.
 */

/** Machine-readable failures. The client maps these to localized copy; we never ship English
 *  from Strapi to the user, and the code is stable even if a Strapi message is reworded. */
export type AuthErrorCode =
  | 'accounts_disabled'
  | 'bad_request'
  | 'captcha'
  | 'email_invalid'
  | 'email_disposable'
  | 'email_unreachable'
  | 'email_taken'
  | 'invalid_credentials'
  | 'unconfirmed'
  | 'blocked'
  | 'invalid_code'
  | 'password_required'
  | 'password_too_short'
  | 'password_already_set'
  | 'wrong_password'
  | 'rate_limited'
  | 'unauthorized'
  | 'upstream';

/** 404 (not 403) when accounts are off: the feature should look absent, not forbidden. */
export function accountsDisabled(): NextResponse | null {
  return siteSettings.features.accounts
    ? null
    : NextResponse.json({ code: 'accounts_disabled' satisfies AuthErrorCode }, { status: 404 });
}

export function fail(code: AuthErrorCode, status: number, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ code, ...extra }, { status });
}

/** Parsed JSON body, or null when it isn't JSON — callers answer 400. */
export async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/**
 * The visitor's IP, for onward forwarding as X-Forwarded-For.
 *
 * Load-bearing for security, not for logging: users-permissions rate-limits its auth routes on
 * path + `ctx.request.ip`, and every one of our calls reaches the CMS from the frontend
 * container. Without this (and `proxy: { koa: true }` on the Strapi side) the entire site
 * shares one bucket — a handful of wrong passwords would lock everybody out, deliberately
 * triggerable by anyone.
 *
 * ORDER MATTERS. `cf-connecting-ip` comes first because Cloudflare sets it from the connection
 * it terminated and strips any client-supplied copy, whereas proxies APPEND to
 * X-Forwarded-For — so its leftmost entry is whatever the caller typed. Trusting that would
 * hand an attacker both halves of the problem back: a fresh bucket per forged value to
 * brute-force from, and the ability to burn a chosen victim's bucket by impersonating their
 * IP. XFF stays as the last resort for local dev, where nothing sets the Cloudflare header.
 */
export function clientIp(req: NextRequest): string | null {
  const trusted = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip');
  if (trusted) return trusted.trim();
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first || null;
}

export type StrapiAuthResult<T = Record<string, unknown>> = {
  ok: boolean;
  status: number;
  data: T & { jwt?: string; user?: StrapiAuthUser; error?: { message?: string; status?: number } };
};

export type StrapiAuthUser = {
  id: number;
  email: string;
  username: string;
  provider?: string | null;
  confirmed?: boolean;
  blocked?: boolean;
  passwordSet?: boolean;
};

/**
 * One call to a CMS auth endpoint. Always no-store, always carries the Cloudflare Access
 * service token (the CMS hostname is gated in deployed environments) and the client IP.
 */
export async function strapiAuth<T = Record<string, unknown>>(
  path: string,
  opts: { method?: 'GET' | 'POST'; body?: unknown; jwt?: string | null; ip?: string | null } = {},
): Promise<StrapiAuthResult<T>> {
  const { method = 'POST', body, jwt, ip } = opts;
  try {
    const res = await fetch(`${STRAPI_FETCH_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...cfAccessHeaders(),
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        ...(ip ? { 'x-forwarded-for': ip } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: data as StrapiAuthResult<T>['data'] };
  } catch (err) {
    console.error(`[auth] ${method} ${path} failed:`, err instanceof Error ? err.message : err);
    return { ok: false, status: 502, data: {} as StrapiAuthResult<T>['data'] };
  }
}

/**
 * Translate a users-permissions failure into our vocabulary. Matching is on substrings
 * because the plugin's messages are English literals in its source; an unrecognized message
 * degrades to `upstream` (a generic "try again"), never to a wrong-but-specific claim.
 */
export function mapStrapiError(result: StrapiAuthResult<Record<string, unknown>>): AuthErrorCode {
  if (result.status === 429) return 'rate_limited';
  if (result.status === 401) return 'unauthorized';
  const message = (result.data?.error?.message ?? '').toLowerCase();
  if (!message) return 'upstream';
  if (message.includes('already taken')) return 'email_taken';
  if (message.includes('not confirmed')) return 'unconfirmed';
  if (message.includes('blocked')) return 'blocked';
  if (message.includes('invalid identifier or password')) return 'invalid_credentials';
  // 'Invalid token' is stock's message for a spent or forged CONFIRMATION link; 'Incorrect
  // code' is the reset equivalent. Both mean "this link is dead", which is the one thing the
  // visitor can act on.
  if (
    message.includes('incorrect code') ||
    message.includes('confirmation token') ||
    message.includes('invalid token')
  )
    return 'invalid_code';
  if (message.includes('already has a password')) return 'password_already_set';
  // Stock change-password's wrong-current-password error is "The provided current password is
  // invalid" — must be caught BEFORE the length catch-all below, or a wrong password reads as
  // "too short".
  if (message.includes('current password')) return 'wrong_password';
  if (message.includes('password')) return 'password_too_short';
  if (message.includes('too many')) return 'rate_limited';
  return 'upstream';
}

/**
 * A password the account holder never sees, used to satisfy Strapi's required `password` on
 * an email-first signup: step 1 collects an address only, and the real password is chosen in
 * step 3 once ownership is proven. 32 base64url bytes, so it is not guessable by anyone who
 * somehow learns the flow — and `passwordSet: false` is what actually authorizes the later
 * set-password call (see the CMS controller).
 */
export function placeholderPassword(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}
