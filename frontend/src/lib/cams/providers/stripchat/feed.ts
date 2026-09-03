import 'server-only';
import type { CamModel, CamProviderAdapter, CamGender } from '../../types';
import { FEED_CACHE } from '../feedCache';
import { cleanDisplayName } from '../../displayName';
import { normalizeLanguages } from '../../languages';
import { normalizeCountry } from '../../countries';

/**
 * StripChat through the Stripcash "Models API for aggregators", verified against a live
 * response (2026-09-03, our domain key):
 *
 *   GET https://go.whitetrafsa.com/app/models-ext/models?userId=<USER_ID>
 *   Authorization: Bearer <STRIPCASH_API_KEY>
 *
 * Measured: 9,123 models, 26.9 MB, 1.1 s. The key is issued PER DOMAIN in their dashboard and
 * is mandatory — without it the endpoint answers 403. Their rate limit is one request per 5 s
 * and the roster refreshes every 30 s; our snapshot poll is 45 s, so ONE request per refresh
 * sits comfortably inside both.
 *
 * WHY THIS ENDPOINT and not `api/models` (which needs no key): only this one carries the two
 * fields the aggregator terms make mandatory — `geobans` and `modelsCountry`. The keyless
 * endpoint also stringifies every value and omits geobans entirely, so it is a probing tool,
 * not a source.
 *
 * THREE THINGS THE PAYLOAD DOES THAT NOTHING ELSE IN THIS CODEBASE DOES:
 *
 *  1. `stream.url` is a TEMPLATE containing `{cdnHost}`
 *     (`https://edge-hls.{cdnHost}/hls/<id>/master/<id>.m3u8`). The response's own
 *     `CDNDefaultHost` fills it. Substituting is not optional — the raw template is not a URL.
 *     Their `CDNHosts` list carries per-country weights, which we deliberately ignore: one
 *     cached page is served to every country, so there is no per-visitor host to pick (the
 *     same reasoning as the sentinel client_ip in the BongaCams feed).
 *  2. Roughly 62% of public models carry a GEOBAN and must not be shown to the blocked
 *     countries "even in listings". Our pages are statically rendered and cached — one
 *     document for all visitors — so per-viewer filtering is impossible and we DROP those
 *     models outright. Measured cost: 5,119 of 8,314 public rooms dropped, leaving 3,195,
 *     which still exceeds the cap below — so at our roster size the compliance choice costs
 *     nothing but ranking depth.
 *  3. Tags are enormous: ~67 per model across 835 distinct slugs, prefixed by niche
 *     (`girls/asian`, `couples/big-ass`). Emitting them raw would bury the useful ones and
 *     blow past the sync's 20-tag cap, so only slugs that map to OUR category vocabulary
 *     survive (see TAG_MAP). Their profile-attribute fields (ethnicity, hair, body type) are
 *     NULL on this endpoint, so tags are the only categorisation source.
 *
 * Until STRIPCASH_API_KEY is set, `stripchatEnabled` is false and the registry skips this
 * adapter entirely — the site then runs without StripChat and its category page hides itself.
 */

const API_KEY = process.env.STRIPCASH_API_KEY ?? '';
/**
 * Our affiliate id, the same one the click template carries. Not a secret (it ships inside
 * every outbound URL), so it has a baked default like IMLIVE_WID.
 */
const USER_ID =
  process.env.STRIPCASH_USER_ID ??
  'd049206f9ddd5694ad628f6e5ba9717a76851349ae4e3e0565f219188cb9b2a6';

const API = `https://go.whitetrafsa.com/app/models-ext/models?userId=${encodeURIComponent(USER_ID)}`;

/**
 * Kept rooms per refresh, taken by viewer count. Same ceiling as Chaturbate's 4×500: far more
 * inventory than the listings can surface, while bounding registry growth (every kept room
 * becomes a row with its own page). The tail is genuinely small — of 3,195 eligible rooms only
 * 815 had 20+ viewers — and ranking is by viewers anyway, so the cap costs nothing visible.
 */
const MAX_MODELS = 2000;

/** 26.9 MB at 1.1 s measured; a slow link deserves more room than the small feeds' 10 s. */
const FETCH_TIMEOUT_MS = 30_000;

export const stripchatEnabled = API_KEY.length > 0;

/**
 * Niche prefix → unified gender key. Every tag list starts with its niche, and the niche is a
 * far cleaner signal than their `gender` field, whose vocabulary mixes room composition with
 * identity (`maleFemale`, `females`, `trannies`). `broadcastGender` is the fallback.
 */
const NICHE_GENDER: Record<string, CamGender> = {
  girls: 'f',
  men: 'm',
  couples: 'c',
  trans: 't',
};

function mapGender(tags: string[], broadcastGender: string | undefined): CamGender {
  for (const tag of tags) {
    const niche = NICHE_GENDER[tag.split('/', 1)[0]];
    if (niche) return niche;
  }
  const v = (broadcastGender ?? '').toLowerCase();
  if (v.includes('trans') || v.includes('tranny') || v.includes('shemale')) return 't';
  if (v === 'group' || v.startsWith('couple')) return 'c';
  if (v.startsWith('male')) return 'm';
  return 'f';
}

/**
 * Their tag slug → OUR tag vocabulary (the `matchTags` of our cam-categories). Built from the
 * live taxonomy, which is why the keys look the way they do: StripChat pluralises appearance
 * tags (`blondes`, `teens`, `brunettes`), says `latin`/`colombian` rather than `latina`, and
 * has no `milf` at all (only `mature`). A slug that is not listed here produces NO tag rather
 * than a guess — the same rule the ImLive feed follows for its attributes.
 *
 * Counts from the measured roster (of 3,195 eligible rooms) are noted where they justify a
 * mapping being worth having at all.
 */
const TAG_MAP: Record<string, string> = {
  // ethnicity / origin
  asian: 'asian', // 493
  chinese: 'chinese', // 247
  japanese: 'japanese',
  korean: 'korean',
  ebony: 'ebony', // 178
  latin: 'latina', // 1208
  colombian: 'latina', // 1347
  mexican: 'mexican',
  // appearance
  blondes: 'blonde', // 480
  redheads: 'redhead', // 134
  brunettes: 'brunette', // 1186
  petite: 'petite', // 842
  skinny: 'skinny', // 181
  curvy: 'curvy', // 492
  bbw: 'bbw', // 114
  hairy: 'hairy', // 508
  'big-tits': 'big tits', // 1101
  'small-tits': 'small tits', // 764
  'big-ass': 'big ass', // 1771
  // age
  teens: 'teen', // 462
  young: 'young', // 1709
  mature: 'mature', // 75 → our milf category
  // acts / kinks that have a category
  anal: 'anal', // 1513
  squirt: 'squirt', // 1198
  'foot-fetish': 'foot-fetish', // 1949
  footjob: 'footjob', // 1091
  bdsm: 'bdsm', // 52
  latex: 'latex', // 399
  leather: 'leather', // 519
  spanking: 'spanking', // 2292
  humiliation: 'humiliation', // 1403
  'jerk-off-instruction': 'joi', // 1353
  sph: 'sph', // 200
  sissy: 'sissy', // 81
  nylon: 'nylon', // 650
  heels: 'heels', // 1439
  // toys
  lovense: 'lovense', // 1505
  'interactive-toys': 'interactive', // 1752
};

/** Their prefixed tags → our vocabulary, deduped. Niche prefixes become gender, not tags. */
function mapTags(tags: string[]): string[] {
  const out = new Set<string>();
  for (const tag of tags) {
    const slash = tag.indexOf('/');
    if (slash === -1) continue; // the bare niche ('girls') — gender, handled elsewhere
    const mapped = TAG_MAP[tag.slice(slash + 1)];
    if (mapped) out.add(mapped);
  }
  return [...out];
}

type StripchatStream = {
  width?: number;
  height?: number;
  /** Contains the literal `{cdnHost}` placeholder — see the header note. */
  url?: string;
  urls?: Record<string, string>;
};

type StripchatRow = {
  id?: number;
  username?: string;
  avatarUrl?: string | null;
  snapshotUrl?: string;
  previewUrlThumbSmall?: string;
  modelsCountry?: string;
  broadcastGender?: string;
  tags?: string[];
  favoritedCount?: number;
  stream?: StripchatStream;
  viewersCount?: number;
  languages?: string[];
  status?: string;
  geobans?: {
    blockedCountries?: string[];
    blockedRegions?: Record<string, unknown> | unknown[];
    blockedLanguages?: string[];
  };
};

/** Any restriction at all → the model is unshowable on a page cached for every country. */
function isGeoRestricted(row: StripchatRow): boolean {
  const g = row.geobans;
  if (!g) return false;
  const regions = g.blockedRegions;
  const regionCount = Array.isArray(regions) ? regions.length : Object.keys(regions ?? {}).length;
  return (g.blockedCountries?.length ?? 0) > 0 || regionCount > 0 || (g.blockedLanguages?.length ?? 0) > 0;
}

function normalize(row: StripchatRow, cdnHost: string): CamModel | null {
  const username = row.username;
  if (!username) return null;

  const tags = Array.isArray(row.tags) ? row.tags : [];
  // The template is useless until the host is substituted; without a host, no playback (the
  // page then shows the affiliate facade, which still earns the click).
  const master = row.stream?.url;
  const streamUrl = master && cdnHost ? master.replace('{cdnHost}', cdnHost) : undefined;

  return {
    id: `sc:${username}`,
    provider: 'sc',
    username,
    displayName: cleanDisplayName(undefined, username),
    gender: mapGender(tags, row.broadcastGender),
    // The live frame, hotlinked straight from their CDN (never copied — see meta.ts).
    thumbUrl: row.snapshotUrl?.startsWith('https://') ? row.snapshotUrl : '',
    profileImageUrl: [row.previewUrlThumbSmall, row.avatarUrl ?? undefined].find((u) =>
      u?.startsWith('https://'),
    ),
    // Never row.clickUrl: outbound links are template-built so online, offline and
    // registry-only models all produce the identical attributed URL.
    affiliateUrl: stripchat.outboundUrl(username),
    embedUrl: '', // No iframe path — the HLS stream plays in our own <video>.
    streamUrl: streamUrl?.startsWith('https://') ? streamUrl : undefined,
    viewers: Math.max(0, Math.floor(Number(row.viewersCount ?? 0) || 0)),
    followers: Number.isFinite(Number(row.favoritedCount)) ? Number(row.favoritedCount) : undefined,
    tags: mapTags(tags),
    languages: normalizeLanguages(Array.isArray(row.languages) ? row.languages : []),
    // Present on only ~40% of rooms; normalizeCountry drops anything unrecognised.
    country: normalizeCountry(row.modelsCountry),
    // Their payload has no seconds-online equivalent, so the registry stamps wentOnlineAt from
    // our own first sighting (see the sync controller) — that drives both the "Live for" pill
    // and the usual-online-hours heatmap.
    onlineSince: undefined,
  };
}

export const stripchat: CamProviderAdapter = {
  id: 'sc',
  name: 'StripChat',
  /**
   * Their room pages refuse framing and the aggregator terms point at the stream (or their own
   * player widget) instead. We take the stream: a plain, CORS-open m3u8 — verified end to end,
   * master → variant → fMP4 segments, every hop `200` with `access-control-allow-origin: *`.
   */
  canEmbed: false,
  enabled: () => stripchatEnabled,

  async fetchOnline() {
    if (!stripchatEnabled) return [];
    const res = await fetch(API, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'User-Agent': 'pornmode.com live-cams aggregator',
      },
      // no-store at runtime, cached only during build — see feedCache.ts for the incident notes.
      ...FEED_CACHE,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`stripchat api: ${res.status}`);
    const data = (await res.json()) as {
      models?: unknown;
      CDNDefaultHost?: string;
    };
    if (!Array.isArray(data.models)) {
      throw new Error(`stripchat api: unexpected payload ${JSON.stringify(data).slice(0, 120)}`);
    }
    const cdnHost = data.CDNDefaultHost ?? '';

    const rows = data.models as StripchatRow[];
    let restricted = 0;
    const eligible: StripchatRow[] = [];
    for (const row of rows) {
      // Only rooms an anonymous visitor can actually watch: their statuses also include
      // private, p2p, virtualPrivate, groupShow and idle.
      if (row.status !== 'public') continue;
      if (isGeoRestricted(row)) {
        restricted += 1;
        continue;
      }
      eligible.push(row);
    }

    // Biggest rooms first, then capped: their own order is by platform rating, which mixes in
    // rooms with a handful of viewers, and our cross-provider ranking sorts on viewers anyway.
    eligible.sort((a, b) => Number(b.viewersCount ?? 0) - Number(a.viewersCount ?? 0));

    const models: CamModel[] = [];
    const seen = new Set<string>();
    for (const row of eligible) {
      if (models.length >= MAX_MODELS) break;
      const model = normalize(row, cdnHost);
      if (!model || seen.has(model.username)) continue;
      seen.add(model.username);
      models.push(model);
    }

    // Logged every refresh so the compliance cost stays visible: a jump here means either a
    // roster change or that we are silently dropping most of the provider.
    console.log(
      `[cams] stripchat: ${models.length} kept of ${rows.length} (${restricted} geo-restricted, capped at ${MAX_MODELS})`,
    );
    return models;
  },

  outboundUrl(username) {
    // SAVED TEMPLATE (docs/cam-affiliate-links.md). Verified live: 302 →
    // stripchat.com/<username>?affiliateId=…&userId=…, which is the attribution hop. Username
    // goes through VERBATIM — do not lowercase or slugify.
    return `https://go.whitetrafsa.com?onlineModels=${encodeURIComponent(username)}&userId=${encodeURIComponent(USER_ID)}`;
  },

  thumbUrl(username) {
    // Live frames carry a hash and a timestamp, so an offline model's cover cannot be rebuilt
    // from the username; '' lets the card fall back to its placeholder tile instead of
    // requesting a URL that is guaranteed to 404.
    void username;
    return '';
  },

  embedUrl() {
    return '';
  },
};
