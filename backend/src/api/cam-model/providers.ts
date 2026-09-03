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
   * Is `viewers`/`peakViewers` a real concurrent-audience count? Mirrors the frontend meta's
   * ranking.viewersComparable (parity-checked). FALSE for a provider whose number measures
   * something else — ImLive reports guests in its free room (0-7) — which is why any backend
   * rule that treats the number as a popularity PROXY must exclude such providers rather than
   * silently rank or filter them out of existence.
   */
  viewersComparable: boolean;
  /**
   * Days a model may stay unseen before its row and media are deleted, when the provider's
   * own terms demand something stricter than our default. Stripcash requires aggregators to
   * remove all stored content for a model absent from their API for 30 consecutive days;
   * our house default (CAM_MODEL_RETENTION_DAYS, 60) would keep it twice as long. Absent =
   * use the default.
   */
  retentionDays?: number;
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

/**
 * Providers whose peakViewers can be read as "how much audience did this room draw" — the only
 * ones a viewer-count threshold can meaningfully filter (see the backfill's MIN_PEAK).
 */
export const AUDIENCE_PEAK_PROVIDERS: ProviderId[] = PROVIDER_IDS.filter(
  (id) => PROVIDERS[id].viewersComparable,
);

/**
 * Effective retention for a provider: its own stricter window when it declares one, else the
 * house default. Keeps the cleanup cron free of provider literals — it asks this function.
 */
export function retentionDaysFor(provider: ProviderId, fallbackDays: number): number {
  const own = PROVIDERS[provider]?.retentionDays;
  return typeof own === 'number' && own > 0 ? own : fallbackDays;
}

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
