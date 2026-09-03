/**
 * Unified shapes for the live-cam aggregator.
 *
 * Live model lists are in-memory snapshots from affiliate feeds; the request path never waits
 * on Strapi for them. Persistence is a separate, async layer: the roster syncs into the
 * cam-model registry (lib/cams/modelSync.ts -> Strapi) so offline pages, the 404 gate and the
 * models sitemap survive restarts — see lib/cams/modelDb.ts for the read side.
 */

import { CAM_PROVIDER_IDS, type CamProvider } from './providers/ids';
import { PROVIDER_META } from './providers/meta';

/** Re-exported so the ~30 existing `from '@/lib/cams/types'` imports keep working; the list
 * itself lives in providers/ids.ts, the bottom of the kernel's dependency graph. */
export type { CamProvider };

export type CamGender = 'f' | 'm' | 'c' | 't';

export interface CamModel {
  /** Stable derivable id: `${provider}:${username}`. */
  id: string;
  provider: CamProvider;
  username: string;
  displayName: string;
  gender: CamGender;
  /** Provider CDN URL — rendered with a plain <img>, never next/image. */
  thumbUrl: string;
  /** Real profile portrait from the feed (BongaCams publishes one; Chaturbate has none). */
  profileImageUrl?: string;
  /** Outbound affiliate link to the model's room. Carries the campaign param, always. */
  affiliateUrl: string;
  /** Live-stream iframe embed for the model page (click-to-load facade). */
  embedUrl: string;
  /**
   * Raw HLS live stream (m3u8), for providers whose rooms refuse framing. BongaCams' affiliate
   * API publishes one per model (stream_feed_url) with open CORS — verified: master playlist,
   * chunklists and segments all answer `access-control-allow-origin: *`, no IP or referer lock.
   */
  streamUrl?: string;
  viewers: number;
  followers?: number;
  location?: string;
  /** Lowercased at normalization time — category matching depends on it. */
  tags: string[];
  /** Canonical language keys (see lib/cams/languages.ts) — may be empty. */
  languages: string[];
  /** Lowercase ISO-2, when the feed's country resolves (see lib/cams/countries.ts). */
  country?: string;
  onlineSince?: string;
  /**
   * ImLive's per-room SDK connection data (their player needs the room's servers, not a URL).
   * EPHEMERAL: a model who reconnects gets a new working server, so this lives ONLY in the
   * in-memory snapshot — never synced to the registry, never read for an offline model.
   */
  imliveRoom?: {
    hostId: string;
    roomId: string;
    workingServer: string;
    cdnServer: string;
    comServer: string;
    webrtcData: string;
    mainImage: string;
  };
  /** e.g. 'public' | 'private' | 'group' (provider-specific). */
  showType?: string;
}

export interface CamProviderAdapter {
  id: CamProvider;
  /** Human name for chips/labels. */
  name: string;
  /**
   * Whether the provider's room can be shown in an iframe. Providers that send
   * X-Frame-Options/CSP frame-ancestors (BongaCams does) must set this false, so model pages
   * offer a click-out instead of an iframe that can only render a refusal.
   */
  canEmbed: boolean;
  /**
   * Whether this provider is wired up right now — normally "are its credentials set". The
   * registry registers `ALL_ADAPTERS.filter((a) => a.enabled())`, so a provider gates itself
   * instead of the registry growing a ternary per provider.
   */
  enabled(): boolean;
  /** Everyone currently online. Throws on failure — the registry degrades gracefully. */
  fetchOnline(): Promise<CamModel[]>;
  /** These three are total functions of the username — they work for offline models too. */
  /**
   * THE money link: the provider's affiliate deep-link for this model, built from the SAVED
   * per-provider template (verified live — see docs/cam-affiliate-links.md). Deterministic
   * from the username alone, never from feed rows: works identically for online, offline and
   * registry-only models. Every user-facing outbound click goes through /out/model/,
   * which 302s to this.
   */
  outboundUrl(username: string): string;
  thumbUrl(username: string): string;
  embedUrl(username: string): string;
}

const PROVIDER_ID_SET: ReadonlySet<string> = new Set(CAM_PROVIDER_IDS);

export const isCamProvider = (v: string): v is CamProvider => PROVIDER_ID_SET.has(v);

/* The three lookup maps below are DERIVED from providers/meta.ts — a new provider brings its
 * own metadata and appears here automatically, with no edit in this file. */

/** Display names, client-safe (the feeds are server-only). */
export const CAM_PROVIDER_NAMES: Record<CamProvider, string> = Object.fromEntries(
  CAM_PROVIDER_IDS.map((id) => [id, PROVIDER_META[id].name]),
) as Record<CamProvider, string>;

/** URL slugs — identical to the provider cam-category slugs, and the first path segment of
 * every model page (/live-sex/bongacams/<username>/). */
export const CAM_PROVIDER_SLUGS: Record<CamProvider, string> = Object.fromEntries(
  CAM_PROVIDER_IDS.map((id) => [id, PROVIDER_META[id].slug]),
) as Record<CamProvider, string>;

const SLUG_TO_PROVIDER = new Map(
  (Object.entries(CAM_PROVIDER_SLUGS) as [CamProvider, string][]).map(([id, slug]) => [slug, id]),
);

/** 'bongacams' → 'bc'; null for anything that isn't a provider slug. */
export function providerFromSlug(slug: string): CamProvider | null {
  return SLUG_TO_PROVIDER.get(slug) ?? null;
}
