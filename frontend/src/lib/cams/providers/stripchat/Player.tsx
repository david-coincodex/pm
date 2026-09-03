'use client';

import { HlsSurface } from '../shared/HlsSurface';
import type { PlayerProps } from '../video-types';

/**
 * StripChat plays in OUR chromeless <video>: the aggregators feed hands out a plain public
 * m3u8 with no token and open CORS — verified end to end (master playlist → variant playlist →
 * fMP4 segments, every hop `200` with `access-control-allow-origin: *`). So the host keeps its
 * own control bar over this surface, hence `ownsControls: false` in the meta.
 *
 * The URL was assembled in the feed by substituting `{cdnHost}` into their template; by the
 * time it reaches here it is an ordinary HLS source.
 */
export default function StripchatPlayer({ model, muted, poster, onFatal }: PlayerProps) {
  return <HlsSurface src={model.streamUrl!} poster={poster} muted={muted} onFatal={onFatal} />;
}
