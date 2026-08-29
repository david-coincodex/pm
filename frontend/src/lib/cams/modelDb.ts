import 'server-only';
import { strapiGet, type StrapiMedia } from '@/lib/strapi';
import type { CamGender, CamProvider } from './types';

/**
 * Reads over the persistent cam-model registry in Strapi (backend/src/api/cam-model) — the
 * record of every model the feeds have EVER carried, written by lib/cams/modelSync.ts. The
 * live snapshot (registry.ts) only knows who is streaming right now; this is what lets a
 * model page distinguish "offline since Tuesday" (render, indexable) from "never existed"
 * (404), and what the models sitemap enumerates.
 */
export type KnownCamModel = {
  id: number;
  documentId: string;
  key: string;
  provider: CamProvider;
  username: string;
  displayName: string | null;
  gender: CamGender | null;
  country: string | null;
  languages: string[] | null;
  tags: string[] | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  peakViewers: number | null;
  profileImageUrl: string | null;
  /** Last live cover URL from the feed (BongaCams thumbs are hashed CDN paths — unrebuildable). */
  thumbUrl: string | null;
  /** Media-library photos: ingested profile portrait + rotating live-snapshot captures. */
  photos: StrapiMedia[] | null;
};

/**
 * Existence is a three-way answer on purpose: 'missing' 404s the page, while 'error'
 * (Strapi unreachable) must FAIL OPEN to the offline render — a CMS blip must never mass-404
 * indexed model pages.
 */
export type KnownModelResult =
  | { status: 'found'; model: KnownCamModel }
  | { status: 'missing' }
  | { status: 'error' };

export async function findKnownModel(provider: CamProvider, username: string): Promise<KnownModelResult> {
  try {
    const res = await strapiGet<KnownCamModel[]>(
      `/cam-models?filters[key][$eq]=${encodeURIComponent(`${provider}:${username}`)}` +
        '&populate[photos]=true&pagination[pageSize]=1',
      { next: { revalidate: 300 } },
    );
    const model = res.data[0];
    return model ? { status: 'found', model } : { status: 'missing' };
  } catch {
    return { status: 'error' };
  }
}

/** Batch lookup for pages that resolve several models at once (the account favorites list). */
export async function findKnownModels(keys: string[]): Promise<Map<string, KnownCamModel>> {
  const out = new Map<string, KnownCamModel>();
  if (keys.length === 0) return out;
  // Chunked at the backend's hard maxLimit (100) — favorites can reach 500.
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += 100) chunks.push(keys.slice(i, i + 100));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const params = chunk.map((k, i) => `filters[key][$in][${i}]=${encodeURIComponent(k)}`).join('&');
        const res = await strapiGet<KnownCamModel[]>(
          `/cam-models?${params}&pagination[pageSize]=100`,
          { next: { revalidate: 300 } },
        );
        for (const m of res.data) out.set(m.key, m);
      } catch {
        // Fail open: callers fall back to whatever thumb they already carry.
      }
    }),
  );
  return out;
}

/** URLs per models-sitemap chunk (protocol caps a file at 50k; smaller keeps fetches light).
 * Backend pages /cam-model-keys at the same size, so one chunk = one request. */
export const MODELS_SITEMAP_CHUNK = 20_000;

export type KnownModelKey = {
  key: string;
  provider: CamProvider;
  username: string;
  lastSeenAt: string | null;
  updatedAt: string;
};

/**
 * One PAGE of known models via the custom /cam-model-keys route (insertion-ordered, so a
 * model's page is stable between crawler fetches). Paged since the registry outgrew a single
 * response — measured ~33k newly-seen models per day, hundreds of thousands of rows at
 * 60-day retention. `total` lets the sitemap index compute its chunk list; the shared
 * data-cache entry means the index and chunk 1 cost one backend call between them.
 */
export async function listKnownModelKeys(page = 1): Promise<{ keys: KnownModelKey[]; total: number }> {
  const res = await strapiGet<KnownModelKey[]>(
    `/cam-model-keys?page=${page}&limit=${MODELS_SITEMAP_CHUNK}`,
    { next: { revalidate: 300 } },
  );
  return { keys: res.data, total: (res as unknown as { total?: number }).total ?? res.data.length };
}
