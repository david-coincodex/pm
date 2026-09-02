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
  external: { lemoncamsSlug: 'bongacams' },
};
