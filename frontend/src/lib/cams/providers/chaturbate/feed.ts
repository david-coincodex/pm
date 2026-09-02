import 'server-only';
import type { CamModel, CamProviderAdapter, CamGender } from '../../types';
import { FEED_CACHE } from '../feedCache';
import { cleanDisplayName, cleanLocation } from '../../displayName';
import { normalizeLanguages } from '../../languages';
import { normalizeCountry } from '../../countries';

/**
 * Chaturbate affiliate API (JSON): /api/public/affiliates/onlinerooms/ — the documented
 * affiliate data source. Chosen over the RSS feeds because it carries what the aggregator
 * actually needs and RSS does not: `tags` (category matching), revshare chat + embed URLs,
 * HD flag, age, seconds_online. Results arrive sorted by viewers.
 *
 * Pagination: limit=500 per page (API max), offset-based. Capped at 4 pages — 2,000 rooms
 * ordered by viewers is more inventory than the browse UI can surface, and the tail is
 * near-empty rooms; a cap also bounds our upstream traffic (politeness).
 */

const WM = process.env.CHATURBATE_WM ?? '';
const PAGE_LIMIT = 500;
const MAX_PAGES = 4;
const API = (offset: number) =>
  `https://chaturbate.com/api/public/affiliates/onlinerooms/?wm=${encodeURIComponent(WM)}&client_ip=request_ip&format=json&limit=${PAGE_LIMIT}&offset=${offset}`;

/** The API's gender vocabulary: f, m, c, s (trans). */
function mapGender(g: string): CamGender {
  if (g === 'm' || g === 'c' || g === 'f') return g;
  if (g === 's' || g === 't') return 't';
  return 'f';
}

type Room = {
  username?: string;
  display_name?: string;
  gender?: string;
  image_url?: string;
  chat_room_url_revshare?: string;
  num_users?: number;
  num_followers?: number;
  location?: string;
  country?: string;
  spoken_languages?: string;
  tags?: unknown[];
  seconds_online?: number;
  current_show?: string;
};

function normalize(room: Room): CamModel | null {
  const username = room.username;
  if (!username) return null;
  const secondsOnline = Number(room.seconds_online ?? NaN);
  return {
    id: `cb:${username}`,
    provider: 'cb',
    username,
    displayName: cleanDisplayName(room.display_name, username),
    gender: mapGender(room.gender ?? 'f'),
    thumbUrl: room.image_url ?? chaturbate.thumbUrl(username),
    affiliateUrl: chaturbate.outboundUrl(username),
    // NOT the API's iframe_embed_revshare: that is the full room (chat UI, sidebars) and it
    // waits for interaction. The video-only player below autoplays the bare stream.
    embedUrl: chaturbate.embedUrl(username),
    viewers: Number(room.num_users ?? 0) || 0,
    followers: Number(room.num_followers ?? NaN) || undefined,
    location: cleanLocation(room.location) ?? cleanLocation(room.country),
    tags: Array.isArray(room.tags) ? room.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean) : [],
    languages: normalizeLanguages([room.spoken_languages]),
    country: normalizeCountry(room.country),
    onlineSince: Number.isFinite(secondsOnline) ? new Date(Date.now() - secondsOnline * 1000).toISOString() : undefined,
    showType: room.current_show,
  };
}

async function fetchPage(offset: number): Promise<Room[]> {
  const res = await fetch(API(offset), {
    headers: { 'User-Agent': 'pornmode.com live-cams aggregator' },
    // no-store at runtime, cached only during build — see feedCache.ts for the incident notes.
    ...FEED_CACHE,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`chaturbate api offset=${offset}: ${res.status}`);
  const data: unknown = await res.json();
  const results = (data as { results?: unknown[] })?.results;
  if (!Array.isArray(results)) throw new Error('chaturbate api: unexpected payload');
  return results as Room[];
}

export const chaturbate: CamProviderAdapter = {
  id: 'cb',
  name: 'Chaturbate',
  /** /embed/<room>/ is frameable (no X-Frame-Options) — see embedUrl below. */
  canEmbed: true,
  // Always on: CHATURBATE_WM has a working default, so there is nothing to gate.
  enabled: () => true,

  async fetchOnline() {
    // Offsets are fixed, so all pages fetch in parallel — a snapshot refresh costs one
    // provider round trip instead of four sequential ones. A short page yields empty tails.
    // allSettled, not all: one flaky page (a VPS-side timeout/429) must cost ~500 rooms, not
    // the whole provider — dropping every Chaturbate model empties its category pages, which
    // then get cached by ISR. Only a TOTAL failure (every page) rejects and marks it degraded.
    const settled = await Promise.allSettled(
      Array.from({ length: MAX_PAGES }, (_, page) => fetchPage(page * PAGE_LIMIT)),
    );
    const pages = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    if (pages.length === 0) {
      throw (settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined)?.reason
        ?? new Error('chaturbate: all pages failed');
    }
    const models: CamModel[] = [];
    const seen = new Set<string>();
    for (const rooms of pages) {
      for (const room of rooms) {
        try {
          const m = normalize(room);
          if (m && !seen.has(m.username)) {
            seen.add(m.username);
            models.push(m);
          }
        } catch {
          /* one malformed room is not a feed failure */
        }
      }
    }
    return models;
  },

  outboundUrl(username) {
    // SAVED TEMPLATE (docs/cam-affiliate-links.md). tour=YrCr per the 2026-09 campaign update
    // (#69; previously YrCp — both resolve to /gotoroom/ WITH fallback=toproom, so a room that
    // just went offline still monetizes by landing on the top room. The feed's own
    // chat_room_url_revshare uses tour=LQps, identical but WITHOUT the fallback — not used.)
    return `https://chaturbate.com/in/?tour=YrCr&campaign=${encodeURIComponent(WM)}&track=default&room=${encodeURIComponent(username)}`;
  },

  thumbUrl(username) {
    // The room's current frame. NOTE: this 404s the moment a model goes offline — it does not
    // fall back to a last-known frame. Cards therefore degrade through the broken-thumb
    // handler in the live-sex layout rather than showing a browser error glyph.
    return `https://thumb.live.mmcdn.com/ri/${encodeURIComponent(username)}.jpg`;
  },

  embedUrl(username) {
    // The bare-stream player (what the aggregator sites frame): no chat, no room UI, autoplays.
    // Verified frameable — /embed/ sends no X-Frame-Options — and it accepts the campaign, so
    // the join overlay inside the player still credits us. disable_sound=1 starts it muted,
    // which is the condition browsers put on autoplay.
    // bgcolor=black: the player letterboxes on aspect mismatch, and its default white ground
    // read as padding/border around the video inside our black frame.
    return `https://chaturbate.com/embed/${encodeURIComponent(username)}/?campaign=${encodeURIComponent(WM)}&disable_sound=1&embed_video_only=1&mobileRedirect=never&bgcolor=black`;
  },
};
