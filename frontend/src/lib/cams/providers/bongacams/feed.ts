import 'server-only';
import type { CamModel, CamProviderAdapter, CamGender } from '../../types';
import { FEED_CACHE } from '../feedCache';
import { cleanDisplayName, cleanLocation } from '../../displayName';
import { normalizeLanguages } from '../../languages';
import { normalizeCountry } from '../../countries';

/**
 * BongaCams promo API (JSON), verified against a live response for campaign 660500.
 *
 *   https://bngprm.com/promo.php?type=api&api_type=json&api_v=2&c=<CAMPAIGN>&client_ip=<ip>&limit=2000
 *
 * Two parameters are non-obvious and both are mandatory:
 *  - `c`          the affiliate campaign. Without it the API answers {"message":"Unknown campaign"}.
 *  - `client_ip`  a real dotted quad. Chaturbate's `request_ip` sentinel is REJECTED here
 *                 ("Please specify correct 'client_ip' parameter"); 0.0.0.0 is accepted and, being
 *                 unroutable, asks for no geo-targeting rather than lying about a visitor's
 *                 location. Server-side rendering has no per-visitor IP to offer anyway — the
 *                 page is one cached document shared by everyone.
 *
 * Paged at 300 for one reason: Next's data cache refuses to store a response over 2 MB, and the
 * full roster in a single request is ~5.7 MB. An uncacheable fetch is not merely wasteful here —
 * marking it `revalidate: 0` opts the whole listing route OUT of static rendering, which is the
 * property the cam pages are built around. Row weight is dominated by model bios and MOVES:
 * measured 3.1 KB/row one day and 4.2 KB/row the next — 500 rows crossed the 2 MB line within
 * two days of being sized. 300 rows is ~1.3 MB at the worst observed density; the bios would
 * have to grow another ~60% to break it.
 *
 * Until BONGACAMS_CAMPAIGN is set, `bongacamsEnabled` is false and the registry skips this
 * adapter entirely — the aggregator then runs Chaturbate-only with no code change.
 */

const CAMPAIGN = process.env.BONGACAMS_CAMPAIGN ?? '';
/** See the note above: a routable-looking IP is required, and 0.0.0.0 opts out of geo-targeting. */
const CLIENT_IP = '0.0.0.0';
/** ~1.3 MB per page at the worst observed row density. See the sizing note above. */
const PAGE_LIMIT = 300;
/** 2,100 rows of headroom over the ~1,400 models typically online. */
const MAX_PAGES = 7;
const API = (offset: number) =>
  `https://bngprm.com/promo.php?type=api&api_type=json&api_v=2` +
  `&c=${encodeURIComponent(CAMPAIGN)}&client_ip=${CLIENT_IP}&limit=${PAGE_LIMIT}&offset=${offset}`;

export const bongacamsEnabled = CAMPAIGN.length > 0;

/**
 * BongaCams gender vocabulary → unified keys. Observed values: female, couple_f_m, couple_f_f;
 * male and trans rooms exist on the platform but were absent from the sampled response, so the
 * prefix checks below cover them without depending on having seen one.
 */
function mapGender(g: string | undefined): CamGender {
  const v = (g ?? '').toLowerCase();
  if (v.startsWith('couple')) return 'c';
  if (v.includes('trans') || v.includes('shemale')) return 't';
  if (v.startsWith('male') || v === 'm') return 'm';
  return 'f';
}

type BongaRow = {
  username?: string;
  display_name?: string;
  gender?: string;
  members_count?: number;
  online_time?: number;
  chat_url?: string;
  profile_page_url?: string;
  /** HLS master playlist for the live stream — the embed BongaCams DOES allow. */
  stream_feed_url?: string;
  hometown?: string;
  homecountry?: string;
  primary_language?: string;
  secondary_language?: string;
  /** Numerically-keyed object, NOT an array: {"0":"blowjob","1":"dancing"}. */
  tags?: Record<string, string>;
  live_images?: { thumbnail_image_big?: string; thumbnail_image_medium?: string };
  profile_images?: { thumbnail_image_big?: string; profile_image?: string };
};

function normalize(row: BongaRow): CamModel | null {
  const username = row.username;
  if (!username) return null;

  const thumb =
    row.live_images?.thumbnail_image_big ??
    row.live_images?.thumbnail_image_medium ??
    row.profile_images?.thumbnail_image_big ??
    bongacams.thumbUrl(username);

  const secondsOnline = Number(row.online_time ?? NaN);

  return {
    id: `bc:${username}`,
    provider: 'bc',
    username,
    displayName: cleanDisplayName(row.display_name, username),
    gender: mapGender(row.gender),
    thumbUrl: thumb,
    profileImageUrl: [row.profile_images?.thumbnail_image_big, row.profile_images?.profile_image].find(
      (u) => u?.startsWith('https://'),
    ),
    // chat_url already carries the campaign through bongacams.com/track — never rebuild it.
    affiliateUrl: bongacams.outboundUrl(username),
    embedUrl: '', // BongaCams sends X-Frame-Options: SAMEORIGIN — see `canEmbed` below.
    // The video CAN still be embedded: the feed's HLS stream plays in a plain <video> tag
    // (hls.js on Chromium/Firefox, native on Safari). https-only — this lands in client markup.
    streamUrl: row.stream_feed_url?.startsWith('https://') ? row.stream_feed_url : undefined,
    viewers: Number(row.members_count ?? 0) || 0,
    location: cleanLocation(row.hometown) ?? cleanLocation(row.homecountry),
    // Values, not keys — the keys are just indices.
    tags: row.tags ? Object.values(row.tags).map((t) => String(t).toLowerCase().trim()).filter(Boolean) : [],
    languages: normalizeLanguages([row.primary_language, row.secondary_language]),
    country: normalizeCountry(row.homecountry),
    onlineSince: Number.isFinite(secondsOnline) ? new Date(Date.now() - secondsOnline * 1000).toISOString() : undefined,
  };
}

async function fetchPage(offset: number): Promise<BongaRow[]> {
  const res = await fetch(API(offset), {
    headers: { 'User-Agent': 'pornmode.com live-cams aggregator' },
    // no-store at runtime, cached only during build — see feedCache.ts for the incident notes.
    ...FEED_CACHE,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`bongacams api offset=${offset}: ${res.status}`);
  const data: unknown = await res.json();
  const models = (data as { models?: unknown })?.models;
  if (!Array.isArray(models)) {
    // Errors come back as {"message": "..."} — surface it, the registry degrades gracefully.
    throw new Error(`bongacams api: unexpected payload ${JSON.stringify(data).slice(0, 120)}`);
  }
  return models as BongaRow[];
}

export const bongacams: CamProviderAdapter = {
  id: 'bc',
  name: 'BongaCams',
  /**
   * BongaCams serves every page with `X-Frame-Options: SAMEORIGIN`, so an IFRAME embed is
   * impossible — measured on both /embed/<user> and /chat-popup/<user>. canEmbed only speaks
   * about iframes: the live VIDEO still embeds via each model's `streamUrl` (HLS), which is
   * what the model page plays. Offline or missing stream → thumbnail + link-out facade.
   */
  canEmbed: false,
  enabled: () => bongacamsEnabled,

  async fetchOnline() {
    if (!bongacamsEnabled) return [];
    // Offsets are fixed, so every page is fetched at once — one round trip's worth of latency.
    // allSettled, not all: one flaky page must not drop every BongaCams model (which empties its
    // category pages and gets that empty page cached). Only a TOTAL failure degrades the provider.
    const settled = await Promise.allSettled(
      Array.from({ length: MAX_PAGES }, (_, i) => fetchPage(i * PAGE_LIMIT)),
    );
    const pages = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    if (pages.length === 0) {
      throw (settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined)?.reason
        ?? new Error('bongacams: all pages failed');
    }
    const models: CamModel[] = [];
    const seen = new Set<string>();
    for (const rows of pages) {
      for (const row of rows) {
        const m = normalize(row);
        if (m && !seen.has(m.username)) {
          seen.add(m.username);
          models.push(m);
        }
      }
    }
    return models;
  },

  outboundUrl(username) {
    // SAVED TEMPLATE (docs/cam-affiliate-links.md). Verified live: models[] accepts our feed
    // usernames VERBATIM (mixed case and digits included — '2Laski2' resolved correctly);
    // bngprm 302s to bongacams.com/track?ps=direct_link&csurl=<model page>, which is the
    // attribution hop. Do NOT lowercase or slugify the username.
    return `https://bngprm.com/promo.php?type=direct_link&v=2&c=${encodeURIComponent(CAMPAIGN)}&models[]=${encodeURIComponent(username)}`;
  },

  thumbUrl(username) {
    // Live thumbnails live on a hashed CDN path that cannot be derived from the username, so an
    // offline BongaCams model has no thumbnail at all. Returning '' lets the card fall back to
    // its placeholder instead of requesting a URL that is guaranteed to 404.
    void username;
    return '';
  },

  embedUrl() {
    return '';
  },
};
