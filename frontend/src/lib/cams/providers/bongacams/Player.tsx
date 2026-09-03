'use client';

import { HlsSurface } from '../shared/HlsSurface';
import type { PlayerProps } from '../video-types';

/**
 * BongaCams plays in OUR chromeless <video>: its feed hands out a PLAIN public m3u8 (no token,
 * open CORS — verified: master playlist, chunklists and segments all answer
 * `access-control-allow-origin: *`), and the provider refuses framing anyway
 * (X-Frame-Options: SAMEORIGIN). So the host keeps its own control bar over this surface —
 * hence `ownsControls: false` in the plugin.
 */
export default function BongacamsPlayer({ model, muted, poster, onFatal }: PlayerProps) {
  return <HlsSurface src={model.streamUrl!} poster={poster} muted={muted} onFatal={onFatal} />;
}
