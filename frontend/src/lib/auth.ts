import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { STRAPI_FETCH_URL, cfAccessHeaders } from '@/lib/strapi';

/**
 * Server-side auth helpers over Strapi users-permissions.
 *
 * BFF pattern: the Strapi JWT lives in an httpOnly cookie (set by /api/auth/* route
 * handlers) and never reaches client JavaScript. Server components call getUser();
 * BFF routes forward the cookie as a Bearer token with authHeaders().
 */

export const AUTH_COOKIE = 'pm_jwt';
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // matches the JWT's 30d expiry

export type AuthUser = {
  id: number;
  documentId: string;
  username: string;
  email: string;
  confirmed: boolean;
  blocked: boolean;
};

/** The JWT from the request cookie, or null. */
export async function getJwt(): Promise<string | null> {
  const c = await cookies();
  return c.get(AUTH_COOKIE)?.value ?? null;
}

/**
 * The logged-in user, or null. React-cache'd: any number of components in one render share
 * a single /users/me round trip. An invalid/expired token reads as logged-out, never throws.
 */
export const getUser = cache(async (): Promise<AuthUser | null> => {
  const jwt = await getJwt();
  if (!jwt) return null;
  try {
    const res = await fetch(`${STRAPI_FETCH_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${jwt}`, ...cfAccessHeaders() },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthUser;
  } catch {
    return null;
  }
});

/** Bearer headers for forwarding the visitor's identity to Strapi from BFF routes. */
export async function authHeaders(): Promise<Record<string, string> | null> {
  const jwt = await getJwt();
  return jwt ? { Authorization: `Bearer ${jwt}`, ...cfAccessHeaders() } : null;
}

export type FavoriteRow = {
  documentId: string;
  provider: string;
  username: string;
  displayName: string | null;
  thumbUrl: string | null;
  gender: string | null;
  notify: boolean;
};

/**
 * The visitor's cam favorites — THE single fetch for every consumer (hub strip, favorites
 * page, BFF route), so the endpoint, row shape, and error policy live in exactly one place.
 * Logged out or any failure → empty list; a favorites hiccup must never fail a page.
 */
export async function getFavorites(): Promise<FavoriteRow[]> {
  const headers = await authHeaders();
  if (!headers) return [];
  try {
    const res = await fetch(`${STRAPI_FETCH_URL}/api/cam-favorites`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return ((await res.json()).data ?? []) as FavoriteRow[];
  } catch {
    return [];
  }
}

/** The one place auth-cookie attributes are defined — register and login must never drift. */
export function setAuthCookie(response: NextResponse, jwt: string): void {
  response.cookies.set(AUTH_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
}

export { STRAPI_FETCH_URL as AUTH_STRAPI_URL };
