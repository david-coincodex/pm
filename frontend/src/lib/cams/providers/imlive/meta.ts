import type { ProviderMeta } from '../meta-types';

/**
 * ImLive's provider facts. Client-safe — the feed (server-only) lives in ./feed.ts and the video
 * surfaces in ./Player.tsx / ./Preview.tsx.
 */
export const imliveMeta: ProviderMeta = {
  id: 'il',
  slug: 'imlive',
  name: 'ImLive',
  media: {
    // Image service host (the feed occasionally names i0.imlmediahub.com for the same asset;
    // we build every URL ourselves, so only the host we emit is preconnected — the backend's
    // ingest allowlist takes both defensively).
    thumbHosts: ['i0.wlmediahub.com'],
    // The SDK player pulls its bundle from j0 and video from the room's CDN (nanocosmos /
    // phenixrts, per-model and therefore not preconnectable) plus the BOSH comms host.
    preconnect: ['https://j0.wlmediahub.com'],
    // `mainimg` is a hashed path, so nothing is rebuildable from the username alone.
    liveThumbDerivable: false,
    // The feed publishes a real profile portrait (mainimg) — the ingest cron stores it.
    hasProfilePortrait: true,
    // Its "thumb" IS that static 30-day-cached portrait, not a live frame: snapshotting it
    // would spend the capture budget re-storing one identical image. Revisit if imLive ever
    // exposes a live-frame URL.
    liveSnapshots: false,
  },
  video: {
    // Their SDK renders its own sound button.
    ownsControls: true,
  },
  external: { lemoncamsSlug: 'imlive' },
};
