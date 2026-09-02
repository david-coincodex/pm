import manifest from './providers.json';

/**
 * The backend's provider kernel: every provider fact the backend needs, derived from
 * providers.json so no file in backend/src carries provider literals.
 *
 * Mirrors the frontend kernel (each provider directory's meta.ts under frontend/src/lib/cams/providers) — the two runtimes
 * can't share a module (per-service Docker build contexts), so
 * scripts/check-provider-parity.mjs keeps them honest.
 */
export type ProviderId = string;

type ProviderEntry = {
  slug: string;
  photoHosts: string[];
  hasProfilePortrait: boolean;
  liveSnapshots: boolean;
  /**
   * URL template for a fresh LIVE frame, `{username}` substituted — for providers whose thumb
   * path is derivable. null when only the feed's stored thumbUrl can be used (hashed paths).
   */
  captureThumbTemplate: string | null;
  lemoncamsSlug: string;
};

export const PROVIDERS: Record<ProviderId, ProviderEntry> = manifest.providers;

/** Every valid provider id — the sync's allowlist and the schema enums' expected contents. */
export const PROVIDER_IDS: ProviderId[] = Object.keys(PROVIDERS);
export const PROVIDER_ID_SET: ReadonlySet<string> = new Set(PROVIDER_IDS);

/** Hosts the photo-ingest service may download from (SSRF allowlist). */
export const ALLOWED_PHOTO_HOSTS: ReadonlySet<string> = new Set(
  PROVIDER_IDS.flatMap((id) => PROVIDERS[id].photoHosts),
);

/** Providers whose feed publishes a real profile portrait → the profile-ingest cron. */
export const PORTRAIT_PROVIDERS: ProviderId[] = PROVIDER_IDS.filter(
  (id) => PROVIDERS[id].hasProfilePortrait,
);

/** Providers whose thumb is a LIVE frame worth capturing periodically → the snapshot cron. */
export const SNAPSHOT_PROVIDERS: ProviderId[] = PROVIDER_IDS.filter(
  (id) => PROVIDERS[id].liveSnapshots,
);

/** `cb` → `chaturbate` on lemoncams, for the one-shot activity-history backfill. */
export const LEMONCAMS_SLUGS: Record<ProviderId, string> = Object.fromEntries(
  PROVIDER_IDS.map((id) => [id, PROVIDERS[id].lemoncamsSlug]),
);

/**
 * The URL the snapshot cron should capture for a model: a freshly-built live-frame URL when the
 * provider's path is derivable, else the last thumb the feed gave us.
 */
export function captureUrlFor(provider: ProviderId, username: string, storedThumbUrl: string | null): string | null {
  const tpl = PROVIDERS[provider]?.captureThumbTemplate;
  return tpl ? tpl.replace('{username}', encodeURIComponent(username)) : storedThumbUrl;
}
