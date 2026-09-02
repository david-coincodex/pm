import 'server-only';
import type { CamModel, CamProviderAdapter, CamGender } from '../../types';
import { FEED_CACHE } from '../feedCache';
import { cleanDisplayName } from '../../displayName';
import { normalizeLanguages } from '../../languages';

/**
 * ImLive — the "Webcam users" host-list API (Azure API Management in front of
 * gstsvc.webcamwiz.com). Docs: the ImLive Webcam API Integration Guide.
 *
 * WE LIST FREE LIVE CHAT ONLY (`freevc~1`): those rooms let an anonymous visitor watch without
 * paying, which is the only honest thing to put behind an autoplaying preview. Measured 68 of
 * 150 online hosts in FLC, so the roster is a healthy few dozen.
 *
 * Response quirks this file handles, all verified against the live API:
 *   - every value is a STRING, including counters ("GCount":"7");
 *   - `Data` is a BARE OBJECT when exactly one host matches (an array otherwise);
 *   - `mainimg` is a RELATIVE path — the absolute URL is built here from the documented
 *     image-service template;
 *   - there is NO seconds_online equivalent, so `onlineSince` stays undefined (the session and
 *     heatmap layers already treat that as "session starts at first sync write");
 *   - `blockcountry*` is geo-BLOCKING data, not the model's location, so `country` stays unset.
 *
 * The SDK connection fields (`webrtcdata`, `cdnserver`, `boshserver`, `WorkingServer`) ride
 * along in `imliveRoom` for the video plugin. They are EPHEMERAL — a model reconnecting gets a
 * new working server — so they live only in the in-memory snapshot and are deliberately never
 * synced to the registry (see lib/cams/modelSync.ts).
 *
 * Until IMLIVE_API_KEY is set, `imliveEnabled` is false and the registry skips this adapter
 * entirely — the aggregator then runs without ImLive and no code changes.
 */

const API_KEY = process.env.IMLIVE_API_KEY ?? '';
/** Affiliate WID for the model deep-link (docs/cam-affiliate-links.md). */
const WID = process.env.IMLIVE_WID ?? '126682575285';
/** One request covers the whole FLC roster; `top` is a ceiling, not a page size. */
const TOP = 100_000;
const PROPS = [
  'nickname',
  'hostid',
  'roomid',
  'mainimg',
  'age',
  'genderid',
  'languages',
  // SDK connection data for the live player.
  'webrtcdata',
  'cdnserver',
  'boshserver',
].join(',');
/** Translated companions of the id props — returned as `l_<prop>`. */
const LNG_PROPS = 'genderid,languages';

const API =
  `https://gstsvc.webcamwiz.com/imlapi_get_hostlist/v/2015-01-01/format/json/` +
  `?filter=freevc~1@bringvisitors~1@top~${TOP}` +
  `&proplist=${PROPS}&lngproplist=${LNG_PROPS}` +
  `&subscription-key=${encodeURIComponent(API_KEY)}`;

export const imliveEnabled = API_KEY.length > 0;

/**
 * Image service template from the docs. 4:3 source; cards crop to 16:9 via object-cover.
 * `qu` is quality, `wi` width, `cctrl` the 30-day cache the docs ask for on model assets.
 */
const imageUrl = (mainimg: string): string =>
  `https://i0.wlmediahub.com/imagesrv/imp_getimage?qu=80&mark=1&cctrl=public,max-age=2592000&is=imlfoh&wi=640&wm=0&fn=${mainimg}`;

/**
 * Room ids double as the room's nature (docs "Room IDs" table), which is the only reliable
 * gender signal when the translated label is missing, and a source of honest tags.
 */
const ROOM_GENDER: Record<string, CamGender> = {
  '10': 'f', // Girl Alone
  '160': 'f', // Shy Girl Alone
  '11': 'f', // Girl Alone Lesbian
  '191': 'f', // Girl On Girl
  '54': 'm', // Guy Alone Straight
  '53': 'm', // Guy Alone Gay
  '52': 'm', // Guy On Guy
  '12': 'c', // Girl And Guy Couples
  '14': 'c', // Threesomes Groups
  '51': 't', // Shemales
  '557': 't', // Shemale Couples
};

/** Extra tags implied by the room type — lowercase, because category matching depends on it. */
const ROOM_TAGS: Record<string, string[]> = {
  '160': ['shy'],
  '11': ['lesbian'],
  '191': ['lesbian'],
  '53': ['gay'],
  '52': ['gay'],
  '12': ['couple'],
  '14': ['group'],
  '51': ['trans'],
  '557': ['trans', 'couple'],
  '13': ['bdsm', 'fetish'],
};

/** Translated gender label first (e.g. "Female"), room type as the fallback. */
function mapGender(label: string | undefined, roomId: string): CamGender {
  const v = (label ?? '').toLowerCase();
  if (v.startsWith('female')) return 'f';
  if (v.startsWith('male')) return 'm';
  if (v.startsWith('couple')) return 'c';
  if (v.includes('shemale') || v.includes('trans')) return 't';
  return ROOM_GENDER[roomId] ?? 'f';
}

type ImliveRow = {
  NickName?: string;
  WorkingServer?: string;
  /** Guests currently in the room — our closest analogue to a viewer count. */
  GCount?: string;
  PropList?: {
    nickname?: string;
    hostid?: string;
    roomid?: string;
    mainimg?: string;
    age?: string;
    genderid?: string;
    l_genderid?: string;
    languages?: string;
    l_languages?: string;
    webrtcdata?: string;
    cdnserver?: string;
    boshserver?: string;
  };
};

function normalize(row: ImliveRow): CamModel | null {
  const p = row.PropList ?? {};
  const username = p.nickname ?? row.NickName;
  // Same charset the backend's sync sanitizer accepts (and that ends up in URLs) — a name it
  // would drop must not enter the snapshot either.
  if (!username || !/^[\w.-]+$/.test(username)) return null;
  const roomId = p.roomid ?? '';
  const thumb = p.mainimg ? imageUrl(p.mainimg) : '';

  return {
    id: `il:${username}`,
    provider: 'il',
    username,
    displayName: cleanDisplayName(username, username),
    gender: mapGender(p.l_genderid, roomId),
    thumbUrl: thumb,
    profileImageUrl: thumb || undefined,
    affiliateUrl: imlive.outboundUrl(username),
    // No iframe path: the room plays through ImLive's own SDK (see ./Player.tsx).
    embedUrl: '',
    viewers: Math.max(0, Math.floor(Number(row.GCount ?? 0) || 0)),
    // Every listed room is free live chat; the room type adds what it honestly implies.
    tags: ['free chat', ...(ROOM_TAGS[roomId] ?? [])],
    languages: normalizeLanguages([p.l_languages ?? '']),
    // Connection data for the SDK player — ephemeral, never synced (see the header note).
    imliveRoom:
      p.hostid && roomId && row.WorkingServer
        ? {
            hostId: p.hostid,
            roomId,
            workingServer: row.WorkingServer,
            cdnServer: p.cdnserver ?? '',
            comServer: p.boshserver ?? '',
            webrtcData: p.webrtcdata ?? '',
            mainImage: p.mainimg ?? '',
          }
        : undefined,
  };
}

export const imlive: CamProviderAdapter = {
  id: 'il',
  name: 'ImLive',
  /** No iframe: their room page refuses framing and the SDK is the supported embed path. */
  canEmbed: false,
  enabled: () => imliveEnabled,

  async fetchOnline() {
    if (!imliveEnabled) return [];
    const res = await fetch(API, {
      ...FEED_CACHE,
      headers: { 'User-Agent': 'pornmode.com live-cams aggregator' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`imlive feed ${res.status}`);
    const json = (await res.json()) as { Response?: { Status?: string; Data?: ImliveRow | ImliveRow[] } };
    const status = json.Response?.Status;
    // The API answers 200 with a Status field; anything but 200 is an API-level failure and
    // must THROW so the registry retains its last-known roster instead of emptying the site.
    if (status && status !== '200') throw new Error(`imlive feed status ${status}`);
    const data = json.Response?.Data;
    // A bare object when exactly one host matches; absent when none are in free chat — which
    // is a truthful empty roster, not an error, so it returns [] rather than throwing.
    const rows: ImliveRow[] = Array.isArray(data) ? data : data ? [data] : [];

    const seen = new Set<string>();
    const models: CamModel[] = [];
    for (const row of rows) {
      const model = normalize(row);
      if (!model || seen.has(model.username)) continue;
      seen.add(model.username);
      models.push(model);
    }
    return models;
  },

  outboundUrl(username) {
    // SAVED TEMPLATE (docs/cam-affiliate-links.md) — username verbatim, wid from env.
    return (
      `https://imlive.com/wmaster.asp?wid=${encodeURIComponent(WID)}&linkid=1036` +
      `&promocode=BCODEL0000000_00000&from=freevideo10&nickname=${encodeURIComponent(username)}`
    );
  },

  /** Hashed image paths — nothing derivable from a username (same as BongaCams). */
  thumbUrl() {
    return '';
  },

  embedUrl() {
    return '';
  },
};
