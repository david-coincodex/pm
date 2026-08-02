/**
 * Job-config helpers: CLI flags and the postId preflight.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fetchAll } from './strapi.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, '..', 'data');

/**
 * Value of `--name <value>`.
 *
 * Returns undefined when the next argv entry is itself a flag. The older copy of this helper
 * in backfill-post-ids.mjs lacks that guard, so `--map --dry-run` silently takes "--dry-run"
 * as the map path.
 */
export function flagValue(name, argv = process.argv) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : undefined;
}

export const hasFlag = (name, argv = process.argv) => argv.includes(`--${name}`);

/**
 * slug -> legacy WordPress post id.
 *
 * Stays in the shared lib, and stays committed, even though the rest of the migration data does
 * not: it is the permanent record that keeps article URLs matching the ones already indexed.
 * Any future article on a legacy slug must reuse its legacy id, and new articles are numbered
 * above the legacy maximum — both need this file long after the migration is done.
 */
export function loadWpPostIds() {
  const raw = JSON.parse(readFileSync(join(DATA_DIR, 'wp-post-ids.json'), 'utf8'));
  return raw.posts ?? raw;
}

/**
 * Validate every job's postId BEFORE any generation, including --dry-run.
 *
 * `postId` is unique in the schema, so without this a batch dies partway through on a
 * constraint violation, after paying for the LLM output of everything before it. Checks:
 * missing id, job/map disagreement, duplicates inside the batch, and — in one batched query —
 * ids already owned by a DIFFERENT slug in Strapi.
 *
 * Returns `slug -> postId`. Throws listing every problem at once rather than the first.
 */
export async function preflightPostIds(jobs, { wpPostIds = loadWpPostIds() } = {}) {
  const problems = [];
  const resolved = new Map();

  // Duplicate slugs first: `resolved` is keyed by slug, so two jobs for the same slug would
  // otherwise collapse into one entry and slip past the postId-collision check below.
  const slugCounts = new Map();
  for (const job of jobs) slugCounts.set(job.slug, (slugCounts.get(job.slug) ?? 0) + 1);
  for (const [slug, n] of slugCounts) {
    if (n > 1) problems.push(`${slug}: listed ${n} times in this batch`);
  }

  for (const job of jobs) {
    const mapped = wpPostIds[job.slug];
    const explicit = job.postId;
    if (explicit !== undefined && mapped !== undefined && explicit !== mapped) {
      problems.push(`${job.slug}: job.postId ${explicit} disagrees with the legacy map (${mapped})`);
      continue;
    }
    const id = explicit ?? mapped;
    if (id === undefined) {
      problems.push(`${job.slug}: no postId — not in data/wp-post-ids.json and no job.postId`);
      continue;
    }
    resolved.set(job.slug, id);
  }

  const seen = new Map();
  for (const [slug, id] of resolved) {
    if (seen.has(id)) problems.push(`postId ${id} claimed by both ${seen.get(id)} and ${slug}`);
    seen.set(id, slug);
  }

  if (resolved.size) {
    const ids = [...new Set(resolved.values())];
    const filter = ids.map((id, i) => `filters[postId][$in][${i}]=${id}`).join('&');
    const existing = await fetchAll('articles', `fields[0]=slug&fields[1]=postId&status=draft&${filter}`);
    const ownerByPostId = new Map(existing.map((a) => [a.postId, a.slug]));
    for (const [slug, id] of resolved) {
      const owner = ownerByPostId.get(id);
      if (owner && owner !== slug) problems.push(`postId ${id} is already used by the existing article "${owner}" (wanted by ${slug})`);
    }
  }

  if (problems.length) {
    throw new Error(`postId preflight failed:\n  - ${problems.join('\n  - ')}`);
  }
  return resolved;
}
