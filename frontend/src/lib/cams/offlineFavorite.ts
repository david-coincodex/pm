import 'server-only';
import type { FavoriteRow } from '@/lib/auth';
import { adapterById } from '@/lib/cams/registry';
import type { KnownCamModel } from '@/lib/cams/modelDb';
import { isCamProvider, type CamModel } from '@/lib/cams/types';

/**
 * A stand-in CamModel for a favorited model that is NOT in the live snapshot right now.
 *
 * Shared by every surface that lists favorites (the account page and the filter route's
 * favorites view) so the offline cover-image fallback logic can never diverge between them.
 * Returns null for a favorite whose provider we no longer recognise — the caller filters those
 * out rather than rendering a card that links nowhere.
 */
export function offlineFavoriteModel(f: FavoriteRow, known: KnownCamModel | undefined): CamModel | null {
  if (!isCamProvider(f.provider)) return null;
  const adapter = adapterById.get(f.provider);
  if (!adapter) return null;
  return {
    id: `${f.provider}:${f.username}`,
    provider: f.provider,
    username: f.username,
    displayName: f.displayName ?? f.username,
    gender: (f.gender as CamModel['gender']) || 'f',
    // Offline cover, freshest first: Chaturbate thumb URLs are deterministic (they 404 when
    // truly gone — the broken-img handler fades to the placeholder); BongaCams thumbs are
    // hashed, so the registry's last-seen URL is the only rebuildable one. The URL saved on the
    // favorite itself is the last resort for models the registry hasn't recorded.
    thumbUrl:
      f.provider === 'cb'
        ? adapter.thumbUrl(f.username)
        : (known?.thumbUrl ?? f.thumbUrl ?? adapter.thumbUrl(f.username)),
    affiliateUrl: adapter.outboundUrl(f.username),
    embedUrl: adapter.embedUrl(f.username),
    viewers: 0,
    tags: [],
    languages: [],
  };
}
