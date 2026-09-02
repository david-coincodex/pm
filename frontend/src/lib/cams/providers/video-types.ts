import type dynamic from 'next/dynamic';
import type { CamModel } from '../types';

/**
 * A dynamically-imported surface. Typed as `dynamic()`'s own return so the two sides speak the
 * same React types (@types/react exposes two entry points that otherwise resolve to
 * structurally distinct ComponentType identities) — and so the contract ENFORCES what the
 * architecture wants: every provider surface is its own chunk, never a statically-bundled
 * import that would ship one provider's playback code to every other provider's pages.
 */
type DynamicSurface<P extends object> = ReturnType<typeof dynamic<P>>;

/**
 * The video plugin contract: how a provider plugs its playback surfaces into the two shared
 * hosts (components/cams/CamPlayer for model pages, CamCardPreview for listing cards).
 *
 * The hosts own everything that must behave identically for every provider — the /out/
 * affiliate overlay, the control bar, the offline/failure facade, hover intent, the
 * one-playing-card-at-a-time mobile arbiter, reduced-motion and Data-Saver opt-outs, the
 * loading sweep. A plugin only answers "can this model play" and "render the picture".
 */

export type PlayerProps = {
  model: CamModel;
  /** Shared sound state (lib/cams/soundPref) — the host renders the toggle. */
  muted: boolean;
  /** Poster/fallback image the host already resolved. */
  poster?: string;
  /** Report an unrecoverable failure: the host swaps in the affiliate facade, so a dead
   * provider script still earns the click. MUST be called, never swallowed. */
  onFatal: () => void;
};

export type PreviewProps = {
  model: CamModel;
  /** Frames are rendering — the host clears its loading sweep. */
  onReady: () => void;
  /** Unrecoverable failure — the host reverts to the static thumbnail. */
  onFatal: () => void;
};

export type VideoPlugin = {
  /** Model-page surface. */
  Player: DynamicSurface<PlayerProps>;
  /** Card hover/autoplay surface, or null when the provider has no previewable video. */
  Preview: DynamicSurface<PreviewProps> | null;
  /**
   * The surface brings its own controls (a provider iframe with its own bar, an SDK player
   * with a built-in sound button), so the host must NOT overlay its control bar — ours could
   * only mask theirs with a mute button that cannot reach a cross-origin player.
   */
  ownsControls: boolean;
  /**
   * Can THIS model play right now? False → the host renders the affiliate facade instead.
   * Keep it a pure check on already-fetched fields; never fetch here.
   */
  canPlay: (model: CamModel) => boolean;
};
