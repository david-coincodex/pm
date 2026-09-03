/**
 * The provider id list — THE single source of truth for "which cam providers exist".
 *
 * Adding a provider starts here with one entry. Every exhaustive `Record<CamProvider, …>` in the
 * codebase (metadata, video plugins) then fails to compile until it is filled in, which is what
 * makes a half-wired provider impossible rather than merely discouraged. See the "Adding a
 * provider" section of docs/live-sex.md.
 *
 * Ids are short and stable: they are stored in the database (cam-model.provider,
 * cam-favorite.provider) and appear in model ids (`${provider}:${username}`) and cam photo
 * filenames — never rename one without a data migration.
 *
 * No imports on purpose: everything else in the kernel imports THIS, so it must sit at the
 * bottom of the dependency graph.
 */
export const CAM_PROVIDER_IDS = ['cb', 'bc', 'il', 'sc'] as const;

export type CamProvider = (typeof CAM_PROVIDER_IDS)[number];
