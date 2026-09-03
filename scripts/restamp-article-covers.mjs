#!/usr/bin/env node
/**
 * restamp-article-covers.mjs
 *
 * Replaces the cover image of existing articles with the house template — wordmark + publish
 * date, nothing else (lib/cover-image.mjs). Written for the two earliest cam posts, which
 * still carried hand-made hero covers: a headline baked into an image goes stale (one of them
 * advertised "Chaturbate & BongaCams" long after we added two more sites) and can't be
 * translated, which is exactly why the template won.
 *
 * The date stamped is the article's OWN publishDate, not today: the cover is part of the post,
 * so re-running this must not silently re-date a year-old article.
 *
 * Usage:
 *   node scripts/restamp-article-covers.mjs --slugs live-sex-cams-now-live,see-when-cam-models-are-online [--dry-run]
 *
 * Env (scripts/.env): STRAPI_URL, STRAPI_TOKEN.
 */
import { mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { STRAPI_URL, TOKEN, requireToken, api, updateArticle, uploadLocalFile } from './lib/strapi.mjs';
import { buildCover } from './lib/cover-image.mjs';
import { hasFlag } from './lib/jobs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
_require('dotenv').config({ path: join(__dirname, '.env'), quiet: true });

const flag = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

const DRY_RUN = hasFlag('dry-run');
const SLUGS = flag('slugs', '').split(',').map((s) => s.trim()).filter(Boolean);
const OUT_DIR = join(tmpdir(), 'pm-restamp-covers');

if (SLUGS.length === 0) {
  console.error('Error: --slugs <slug,slug> is required.');
  process.exit(1);
}

async function deleteOldMediaByName(name, keepId) {
  const json = await api(`/upload/files?filters[name][$eq]=${encodeURIComponent(name)}`);
  const files = Array.isArray(json) ? json : json.results ?? json.data ?? [];
  for (const f of files) {
    if (f.id === keepId) continue;
    await fetch(`${STRAPI_URL}/api/upload/files/${f.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` },
    }).catch(() => {});
  }
}

async function main() {
  if (!DRY_RUN) requireToken();
  mkdirSync(OUT_DIR, { recursive: true });

  for (const slug of SLUGS) {
    const json = await api(
      `/articles?filters[slug][$eq]=${encodeURIComponent(slug)}&populate[coverImage]=true&pagination[pageSize]=1`,
    );
    const article = json.data?.[0];
    if (!article) { console.warn(`  ⚠ not found, skipped: ${slug}`); continue; }

    const date = article.publishDate ? new Date(article.publishDate) : new Date();
    const stamped = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    console.log(`\n${slug} (post ${article.postId})`);
    console.log(`  was: ${article.coverImage?.name ?? '(none)'}`);
    console.log(`  new: wordmark + ${stamped}`);

    if (DRY_RUN) continue;

    const cover = await buildCover({ outFile: join(OUT_DIR, `${slug}.png`), date });
    // Named per slug so two articles can never fight over one file — the old covers used a
    // per-article name too, and those are cleaned up by name after the swap.
    const name = `pornmode-${slug}-cover.png`;
    const up = await uploadLocalFile(cover.file, name, 'image/png', 'image/');
    await updateArticle(article.documentId, { coverImage: up.id });
    await deleteOldMediaByName(name, up.id);
    console.log(`  ✓ ${up.url}`);
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  if (!DRY_RUN) console.log('\nPromote with: node scripts/push-changed-content.mjs --only articles --apply');
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
