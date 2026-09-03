import type { ProviderMeta } from '../meta-types';

/**
 * StripChat's provider facts (traffic is bought through Stripcash). Client-safe — the feed
 * (server-only) lives in ./feed.ts and the video surfaces in ./Player.tsx / ./Preview.tsx.
 */
export const stripchatMeta: ProviderMeta = {
  id: 'sc',
  slug: 'stripchat',
  name: 'StripChat',
  media: {
    // Live stream frames (img.doppiocdn.com) and profile/preview images
    // (static-proxy.strpst.com). HOTLINKED, never downloaded — see hasProfilePortrait below.
    thumbHosts: ['img.doppiocdn.com', 'static-proxy.strpst.com'],
    // The HLS master and its media segments come from two different CDN hosts; both are worth
    // warming on a model page because playback starts with a request to each.
    preconnect: ['https://edge-hls.growcdnssedge.com', 'https://media-hls.growcdnssedge.com'],
    // Image paths are content-hashed and the live frame carries a timestamp — neither is
    // derivable from the username, so an offline model's cover is whatever the registry stored.
    liveThumbDerivable: false,
    /**
     * BOTH image capabilities are off for a COMPLIANCE reason, not a technical one: the
     * Stripcash aggregator terms say "You must not download these images. Instead, use the URLs
     * directly in your site's image elements." Leaving these false is what keeps the
     * profile-ingest and snapshot crons away from this provider — they derive their provider
     * lists from these flags (see backend providers.ts), so no code path can start copying
     * StripChat media into our media library by accident.
     */
    hasProfilePortrait: false,
    liveSnapshots: false,
  },
  ranking: {
    // viewersCount is a real concurrent-audience count, same species as Chaturbate's num_users
    // and BongaCams' members_count: measured max 4,659 with a long tail of small rooms. So
    // StripChat competes on the real number and shows the viewer badge.
    viewersComparable: true,
  },
  video: {
    // Plain HLS in OUR <video>, so the host keeps its control bar (same as BongaCams).
    ownsControls: false,
  },
  external: { lemoncamsSlug: 'stripchat' },
};
