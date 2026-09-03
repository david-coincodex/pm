'use client';

import type { PlayerProps } from '../video-types';

/**
 * Chaturbate's own bare-stream player in an iframe.
 *
 * WHY an iframe and not our <video>: the stream is only resolvable/playable from the VISITOR'S
 * IP — the tokenized playlist is bound to whoever resolved it, and our datacenter VPS is in
 * fact BLOCKED from resolving it at all (Cloudflare datacenter challenge; verified on staging).
 * The browser resolves and plays it, so it works cross-IP where a server-side resolve cannot.
 * See memory cb-stream-token-ip-bound.
 *
 * No chat, autoplays muted (`disable_sound=1` lives in embedUrl), and it owns its own audio and
 * fullscreen — a cross-origin iframe is unreachable from our sound store, which is why this
 * plugin declares `ownsControls: true` and the host does not overlay its bar.
 */
export default function ChaturbatePlayer({ model }: PlayerProps) {
  return (
    <iframe
      src={model.embedUrl}
      title={model.displayName}
      className="absolute inset-0 h-full w-full"
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      allowFullScreen
      scrolling="no"
    />
  );
}
