import 'server-only';
import { createHash } from 'node:crypto';
import { after } from 'next/server';
import { cookies, headers } from 'next/headers';
import { GA_MEASUREMENT_ID } from '@/lib/analytics';

/**
 * Server-side GA4 via the Measurement Protocol.
 *
 * Why not `trackEvent` from lib/analytics.ts: that one runs in the browser through gtag.js, which
 * every ad blocker drops — and this audience blocks trackers heavily, so client-side affiliate
 * click counts are systematically short. These hits leave our own Node process, so there is
 * nothing on the visitor's machine that can refuse them.
 *
 * What the Measurement Protocol will NOT give you, no matter how it is called:
 *  - **Geo and device.** GA4 derives both from the requesting IP and User-Agent, which for these
 *    hits is our server. There is no `ip_override` for GA4 (that was Universal Analytics' `uip`),
 *    so GA's own Country/Device/Browser dimensions are meaningless on server events. That is
 *    exactly why the caller passes `country` from Cloudflare as an explicit parameter — see
 *    docs/analytics-server-side.md for registering it as a custom dimension.
 *  - **Automatic session/user stitching.** We reconstruct it from the GA cookies below when they
 *    exist; when gtag was blocked they do not, and we fall back to a derived id.
 */

const MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
/** Validates a payload and returns problems instead of recording it. GA_MP_DEBUG=1 to use. */
const MP_DEBUG_ENDPOINT = 'https://www.google-analytics.com/debug/mp/collect';

/** Server-only: an API secret in NEXT_PUBLIC_* would be readable by anyone. */
const API_SECRET = process.env.GA_API_SECRET ?? '';
const DEBUG = process.env.GA_MP_DEBUG === '1';

export type ServerEventParams = Record<string, string | number | boolean | undefined>;

type GaContext = {
  clientId: string;
  sessionId?: string;
  country?: string;
  /** False when this request is a prefetch, a bot, or a subresource rather than a real landing. */
  isRealVisit: boolean;
  /** True when the visitor's gtag cookies were present — i.e. GA was NOT blocked for them. */
  hasGaCookie: boolean;
  /** When the visitor actually landed. Captured during render, because the hit is sent later. */
  requestedAtMicros: number;
};

/**
 * GA4's `_ga` cookie is `GA1.<depth>.<clientId>` where the client id is itself two dot-separated
 * numbers, so the id is always the last two segments regardless of cookie domain depth.
 */
function clientIdFromCookie(value: string | undefined): string | null {
  if (!value) return null;
  const id = value.split('.').slice(-2).join('.');
  return /^\d+\.\d+$/.test(id) ? id : null;
}

/**
 * Session id out of the per-stream `_ga_<STREAM>` cookie. Two formats are in the wild:
 *   GS2.1.s1755000000$o3$g1$t1755000123$j45   → after `s`, before the first `$`
 *   GS1.1.1755000000.3.0.1755000000.0.0.0     → third dot-separated segment
 * Without this the hit opens its own session, which double-counts sessions for every click.
 */
function sessionIdFromCookie(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const gs2 = value.match(/\bs(\d{6,})/);
  if (gs2) return gs2[1];
  const parts = value.split('.');
  return /^\d{6,}$/.test(parts[2] ?? '') ? parts[2] : undefined;
}

/**
 * Stand-in client id for visitors whose gtag never ran (so there is no `_ga` cookie to reuse).
 *
 * A fresh random id per request would count every blocked visitor as a brand-new user and wreck
 * the user metric, so this derives a stable one from IP + User-Agent, rotated daily. The inputs
 * are hashed and never stored; only the resulting opaque number pair reaches Google.
 */
function derivedClientId(ip: string, ua: string, salt: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const hash = createHash('sha256').update(`${ip}|${ua}|${day}|${salt}`).digest();
  // GA client ids look like "1234567890.1234567890"; two 32-bit reads reproduce that shape.
  return `${hash.readUInt32BE(0)}.${hash.readUInt32BE(4)}`;
}

const BOT_UA = /bot|crawler|spider|crawl|slurp|headless|lighthouse|pagespeed|monitor|preview|curl|wget|python-requests|axios|go-http/i;

async function readGaContext(): Promise<GaContext> {
  const [h, c] = await Promise.all([headers(), cookies()]);

  const ua = h.get('user-agent') ?? '';
  // Cloudflare gives the real client IP and country; the socket address here is Traefik's.
  const ip = h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const country = h.get('cf-ipcountry') ?? undefined;

  // A prefetch renders the route on the server without a human ever seeing it. Next currently
  // returns only the router tree for dynamic segments, but that is an implementation detail —
  // counting only genuine top-level navigations keeps the metric correct either way.
  const isPrefetch = h.get('next-router-prefetch') !== null || h.get('rsc') !== null;
  const fetchMode = h.get('sec-fetch-mode');
  const isNavigation = fetchMode === null || fetchMode === 'navigate';

  const cookieClientId = clientIdFromCookie(c.get('_ga')?.value);
  const streamCookie = c.get(`_ga_${GA_MEASUREMENT_ID.replace(/^G-/, '')}`)?.value;

  return {
    clientId: cookieClientId ?? derivedClientId(ip, ua, API_SECRET),
    sessionId: sessionIdFromCookie(streamCookie),
    country: country && country !== 'XX' ? country : undefined,
    isRealVisit: isNavigation && !isPrefetch && !BOT_UA.test(ua),
    hasGaCookie: cookieClientId !== null,
    requestedAtMicros: Date.now() * 1000,
  };
}

async function post(ctx: GaContext, name: string, params: ServerEventParams): Promise<void> {
  const body = {
    client_id: ctx.clientId,
    // Microseconds, per the protocol. Sent explicitly and captured during render: `after()` runs
    // once the response is already flushed, so the default (Google's receive time) would drift
    // from when the visitor actually landed.
    timestamp_micros: ctx.requestedAtMicros,
    events: [
      {
        name,
        params: {
          // GA drops undefined into reports as the literal string "undefined".
          ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')),
          ...(ctx.sessionId && { session_id: ctx.sessionId }),
          // Required for the hit to register as engaged; without it GA4 records the event but
          // leaves it out of the realtime and engagement reports.
          engagement_time_msec: 1,
        },
      },
    ],
  };

  const url = `${DEBUG ? MP_DEBUG_ENDPOINT : MP_ENDPOINT}?measurement_id=${encodeURIComponent(
    GA_MEASUREMENT_ID,
  )}&api_secret=${encodeURIComponent(API_SECRET)}`;

  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    // Analytics must never join the page's cache or hold the request open.
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  });

  if (DEBUG) {
    // The debug endpoint answers 200 with a list of what is wrong, so the body is the whole point.
    console.log(
      `[ga:mp] ${name} client_id=${ctx.clientId}`,
      JSON.stringify(body.events[0].params),
      await res.text(),
    );
  } else if (!res.ok) {
    // The live endpoint answers 204 with an empty body and validates nothing — a non-2xx here is
    // a transport or credential problem, never a payload problem.
    console.error(`[ga:mp] ${name} failed: ${res.status} ${res.statusText}`);
  }
}

/**
 * Record a GA4 event from the server. Never throws and never delays the response: the hit is
 * scheduled with `after()`, so it flies once the page has already been sent.
 *
 * Reading request headers makes the calling route render per request instead of being served from
 * the full route cache — which is required for a per-visit metric, and is the intended trade.
 */
export async function trackServerEvent(name: string, params: ServerEventParams = {}): Promise<void> {
  if (!API_SECRET) {
    // Loud in development, silent in production: a missing secret is a setup step, not an incident
    // worth writing to the log on every single affiliate click.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[ga:mp] GA_API_SECRET is not set — "${name}" not sent. See docs/analytics-server-side.md`);
    }
    return;
  }

  const ctx = await readGaContext();
  if (!ctx.isRealVisit) return;

  after(async () => {
    try {
      await post(ctx, name, {
        ...params,
        // From Cloudflare, on every event: GA's own Country dimension reports our server's
        // location for Measurement Protocol hits, so this parameter is the only true geo signal.
        country: ctx.country,
        // Lets you measure how much of the click volume gtag was missing. NOT named `ga_*`:
        // GA4 reserves that prefix (along with `google_` and `firebase_`) and silently drops
        // parameters that use it — the live endpoint returns 204 either way, so this is only
        // ever caught via GA_MP_DEBUG=1.
        cookie_state: ctx.hasGaCookie ? 'present' : 'blocked',
      });
    } catch (err) {
      // A dropped analytics hit must never surface to the visitor or fail the request.
      console.error(`[ga:mp] ${name} error:`, err instanceof Error ? err.message : err);
    }
  });
}
