// client-only is STRUCTURAL: this module calls dynamic({ ssr: false }), which Next forbids in
// Server Components. Capability data a server component needs (ownsControls) lives in
// providers/meta.ts instead, so importing this from the server fails loudly here rather than
// with a confusing runtime error deep in a page.
import 'client-only';
import dynamic from 'next/dynamic';
import type { CamProvider } from './ids';
import type { VideoPlugin } from './video-types';

/**
 * Every provider's video plugin, keyed by id — read by components/cams/CamPlayer (model pages)
 * and CamCardPreview (listing cards).
 *
 * `Record<CamProvider, VideoPlugin>` is the anti-regression mechanism: add an id to
 * providers/ids.ts and this file fails to compile until the provider declares its surfaces, so
 * a provider can never be half-wired. Equally important, the SHARED hosts derive the affiliate
 * overlay and the control bar from this contract rather than from provider-shaped booleans, so
 * a new provider inherits monetization and controls instead of silently missing them.
 *
 * Each surface is a separate `next/dynamic` chunk with `ssr: false`: a Chaturbate page never
 * downloads, parses, or can fail on another provider's playback code (some are heavy — a
 * provider SDK can be hundreds of KB), and playback is client-only anyway.
 */
export const VIDEO_PLUGINS: Record<CamProvider, VideoPlugin> = {
  cb: {
    Player: dynamic(() => import('./chaturbate/Player'), { ssr: false }),
    Preview: dynamic(() => import('./chaturbate/Preview'), { ssr: false }),
    canPlay: (m) => m.embedUrl.length > 0,
  },
  bc: {
    Player: dynamic(() => import('./bongacams/Player'), { ssr: false }),
    Preview: dynamic(() => import('./bongacams/Preview'), { ssr: false }),
    canPlay: (m) => Boolean(m.streamUrl),
  },
  il: {
    Player: dynamic(() => import('./imlive/Player'), { ssr: false }),
    Preview: dynamic(() => import('./imlive/Preview'), { ssr: false }),
    // Needs the room's live connection data; an offline/registry-only model has none.
    canPlay: (m) => Boolean(m.imliveRoom),
  },
};
