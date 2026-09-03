import type { CamProvider } from './ids';
import type { ProviderMeta } from './meta-types';
import { chaturbateMeta } from './chaturbate/meta';
import { bongacamsMeta } from './bongacams/meta';
import { imliveMeta } from './imlive/meta';

/**
 * Every provider's metadata, keyed by id. Client-safe (see meta-types.ts).
 *
 * `Record<CamProvider, ProviderMeta>` is load-bearing: add an id to providers/ids.ts and this
 * map fails to compile until the provider's meta exists. Shared code reads facts from here
 * instead of branching on provider ids — lib/cams/types.ts derives the name/slug maps,
 * CamThumbHead derives its preconnect hosts, the model page derives cover behavior and player
 * preconnects, and the backend mirror (backend/src/api/cam-model/providers.json) is checked
 * against it by scripts/check-provider-parity.mjs.
 */
export const PROVIDER_META: Record<CamProvider, ProviderMeta> = {
  cb: chaturbateMeta,
  bc: bongacamsMeta,
  il: imliveMeta,
};

export const ALL_PROVIDER_META: ProviderMeta[] = Object.values(PROVIDER_META);

/** Every hostname any provider serves model images from — preconnect + allowlist source. */
export const ALL_THUMB_HOSTS: string[] = [
  ...new Set(ALL_PROVIDER_META.flatMap((m) => m.media.thumbHosts)),
];
