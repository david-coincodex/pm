import type { ProviderMeta } from '../meta-types';

/**
 * Chaturbate's provider facts. Client-safe — the feed (server-only) lives in ./feed.ts and the
 * video surfaces in ./Player.tsx / ./Preview.tsx.
 */
export const chaturbateMeta: ProviderMeta = {
  id: 'cb',
  slug: 'chaturbate',
  name: 'Chaturbate',
  media: {
    // The live thumb host; `ri/<user>.jpg` is rebuildable from the username alone.
    thumbHosts: ['thumb.live.mmcdn.com'],
    // The embed pulls its player bundles + video from these the moment the iframe mounts.
    preconnect: ['https://chaturbate.com', 'https://web2.static.mmcdn.com'],
    liveThumbDerivable: true,
    // Chaturbate publishes no profile portrait — only the live frame.
    hasProfilePortrait: false,
    liveSnapshots: true,
  },
  ranking: {
    // num_users = viewers in the room right now.
    viewersComparable: true,
  },
  video: {
    // The provider iframe carries its own bar and owns its audio (cross-origin).
    ownsControls: true,
  },
  external: { lemoncamsSlug: 'chaturbate' },
};
