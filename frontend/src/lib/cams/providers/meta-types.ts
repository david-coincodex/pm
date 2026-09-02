import type { CamProvider } from './ids';

/**
 * Per-provider metadata: the facts shared code needs to know about a provider, expressed as
 * DATA so that shared code never grows a provider-shaped `if`.
 *
 * Deliberately free of any dependency on CamModel or React — this module is imported by
 * lib/cams/types.ts (which derives the name/slug maps from it), so anything heavier would
 * create an import cycle. Runtime behavior lives in the sibling files of each provider
 * directory: `feed.ts` (server-only) and `Player.tsx`/`Preview.tsx` (client), wired through
 * providers/video.ts.
 *
 * Client-safe: no `process.env` at module scope, no server-only imports. The video plugin
 * registry and the model page both read this in the browser.
 */
export type ProviderMeta = {
  id: CamProvider;
  /** URL slug: the model page's first path segment and the provider cam-category's slug. */
  slug: string;
  /** Human name for chips, labels and breadcrumbs. */
  name: string;
  media: {
    /**
     * Hostnames serving this provider's model images. Used for frontend preconnects AND
     * mirrored into the backend's photo-ingest allowlist (see backend providers.json — kept
     * honest by scripts/check-provider-parity.mjs).
     */
    thumbHosts: string[];
    /** Extra origins the player pulls from — preconnected only on this provider's model pages. */
    preconnect: string[];
    /**
     * True when a live thumbnail URL can be rebuilt from the username alone (Chaturbate's
     * `thumb.live.mmcdn.com/ri/<user>.jpg`). False for providers whose image paths are hashed,
     * where the registry's last-known URL is the only usable cover. Replaces the
     * `provider === 'cb' ? … : …` branches on the model and favorites pages.
     */
    liveThumbDerivable: boolean;
    /** The feed publishes a real profile portrait → the hourly profile-ingest cron includes it. */
    hasProfilePortrait: boolean;
    /** The feed's thumb is a LIVE frame worth capturing periodically → snapshot cron includes it. */
    liveSnapshots: boolean;
  };
  video: {
    /**
     * The provider's playback surface brings its own controls (a provider iframe with its own
     * bar, an SDK player with a built-in sound button), so OUR sound UI must stay hidden —
     * ours could only mask theirs with a button that cannot reach a cross-origin player.
     * Lives here rather than in the video plugin because SERVER components need it too (the
     * model page decides whether to render CamSoundButton), and providers/video.ts is
     * client-only by necessity.
     */
    ownsControls: boolean;
  };
  external: {
    /** This provider's slug on lemoncams, for the one-shot activity-history backfill. */
    lemoncamsSlug: string;
  };
};
