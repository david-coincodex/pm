import type { ProviderMeta } from '../meta-types';

/**
 * BongaCams' provider facts. Client-safe — the feed (server-only) lives in ./feed.ts and the
 * video surfaces in ./Player.tsx / ./Preview.tsx.
 */
export const bongacamsMeta: ProviderMeta = {
  id: 'bc',
  slug: 'bongacams',
  name: 'BongaCams',
  media: {
    thumbHosts: ['i.bgicdn.com'],
    // The HLS stream plays in OUR <video>; no provider page assets to warm.
    preconnect: [],
    // Image paths are hashed CDN URLs — unrebuildable, so the registry's last-known URL is the
    // only usable cover for an offline model.
    liveThumbDerivable: false,
    hasProfilePortrait: true,
    liveSnapshots: true,
  },
  ranking: {
    // members_count = viewers in the room right now (same kind of number as CB's).
    viewersComparable: true,
  },
  video: {
    // Plays in OUR <video>, so the host keeps its control bar.
    ownsControls: false,
  },
  external: { lemoncamsSlug: 'bongacams' },
};
