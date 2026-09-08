import { NextResponse, type NextRequest } from 'next/server';
import { setAuthCookie } from '@/lib/auth';
import { accountsDisabled, clientIp, fail, mapStrapiError, readJson, strapiAuth } from '@/lib/authApi';

/**
 * Exchange a Google access token from the POPUP flow for a session.
 *
 * Google Identity Services' token client hands the browser an OAuth access token without any
 * navigation, and that is precisely what stock users-permissions already accepts at
 * `GET /api/auth/google/callback?access_token=…` — the same endpoint the redirect flow ends
 * at. So the popup needs no new auth logic anywhere: only this exchange, server-side, so the
 * Strapi JWT is set as an httpOnly cookie and never touches client JavaScript.
 *
 * (Google's One Tap prompt is a different thing and deliberately not used: it returns a signed
 * ID token, which stock cannot verify — supporting it would mean reimplementing provider login
 * against Google's JWKS.)
 *
 * KNOWN GAP, accepted: stock's `/auth/:provider/callback` is the one auth route the plugin
 * ships WITHOUT its rate limiter, so this endpoint is unmetered — each call costs one Strapi
 * request and one Google tokeninfo lookup, nothing else (no email, no DB write on failure).
 * Amplification is 1:1 and production sits behind Cloudflare, where a rule can cap it if it is
 * ever abused. A captcha here would break the flow: the visitor just authenticated with Google.
 */
export async function POST(req: NextRequest) {
  const disabled = accountsDisabled();
  if (disabled) return disabled;

  const body = await readJson<{ accessToken?: unknown }>(req);
  if (!body || typeof body.accessToken !== 'string' || !body.accessToken) return fail('bad_request', 400);

  const result = await strapiAuth(
    `/api/auth/google/callback?access_token=${encodeURIComponent(body.accessToken)}`,
    { method: 'GET', ip: clientIp(req) },
  );
  if (!result.ok || !result.data.jwt) {
    // `email_taken`: this address already has an email+password account and stock connect
    // refuses to link them. The button turns that into actionable copy.
    const code = result.ok ? 'upstream' : mapStrapiError(result);
    console.warn('[auth] google token exchange failed:', result.status, code);
    return fail(code, result.ok ? 502 : result.status);
  }

  const response = NextResponse.json({ ok: true });
  setAuthCookie(response, result.data.jwt);
  return response;
}
