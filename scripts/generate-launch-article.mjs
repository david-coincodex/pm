#!/usr/bin/env node
/**
 * generate-launch-article.mjs
 *
 * Generates the /live-sex "Live Sex Cams" launch ANNOUNCEMENT blog article and writes it into
 * local Strapi (article collection), ready to be promoted with push-changed-content.mjs.
 *
 * Three ingredients, all built here:
 *   1. Screenshots of the live /live-sex/ pages (Playwright → lib/screenshots.mjs), uploaded to
 *      Strapi and embedded inline in the CKEditor-HTML body.
 *   2. A typographic PornMode cover (SVG→PNG via sharp → lib/cover-image.mjs) as coverImage.
 *   3. The article copy (OpenAI gpt-5.5, JSON out), with {{SCREENSHOT_*}} markers the script fills.
 *
 * Idempotent by slug: re-running UPDATES in place (keeps postId / the /blog/<postId>/<slug>/ URL).
 * Mirrors generate-ad-articles.mjs; uses the shared scripts/lib/strapi.mjs client.
 *
 * Usage:
 *   node scripts/generate-launch-article.mjs [--dry-run]
 *   node scripts/generate-launch-article.mjs --author mike-wood --category live-sex \
 *        --slug live-sex-cams-now-live --frontend http://localhost:3002
 *
 * Env (scripts/.env): STRAPI_URL, STRAPI_TOKEN, OPENAI_API_KEY.
 */

import { readFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import OpenAI from 'openai';

import {
  STRAPI_URL, TOKEN, requireToken,
  api, articlesBySlug, createArticle, updateArticle, uploadLocalFile,
} from './lib/strapi.mjs';
import { captureShots, firstLiveModelPath } from './lib/screenshots.mjs';
import { buildCover } from './lib/cover-image.mjs';

const _require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
_require('dotenv').config({ path: `${__dirname}/.env`, quiet: true });

// ── CLI ───────────────────────────────────────────────────────────────────────
const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const DRY_RUN = has('dry-run');
const AUTHOR_SLUG = flag('author', 'mike-wood');
const CATEGORY_SLUG = flag('category', 'live-sex');
const SLUG = flag('slug', 'live-sex-cams-now-live');
const FRONTEND = (flag('frontend', 'http://localhost:3002')).replace(/\/+$/, '');
// Scratch dir OUTSIDE the repo — the generated PNGs are uploaded to Strapi and must never be
// committed. Deleted after a successful upload; on --dry-run they stay here for inspection.
const OUT_DIR = join(tmpdir(), 'pm-launch-article');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) { console.error('Error: OPENAI_API_KEY is required (scripts/.env).'); process.exit(1); }
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const SYSTEM_PROMPT = readFileSync(join(__dirname, 'launch-article-prompt.md'), 'utf8');

const MARKERS = ['SCREENSHOT_HUB', 'SCREENSHOT_CATEGORY', 'SCREENSHOT_MODEL'];

// ── helpers ─────────────────────────────────────────────────────────────────────
/** Resolve a slug → documentId for a relation (author/category). */
async function resolveDocId(collection, slug) {
  const json = await api(`/${collection}?filters[slug][$eq]=${encodeURIComponent(slug)}&fields[0]=slug`);
  return json.data?.[0]?.documentId ?? null;
}

/**
 * Delete media named `name` EXCEPT `keepId` — the old copies from a previous run, called only
 * AFTER the new upload is live and the article points at it. Never delete-before-upload: a
 * failure between the two would leave the article referencing a file that no longer exists.
 */
async function deleteOldMediaByName(name, keepId) {
  const json = await api(`/upload/files?filters[name][$eq]=${encodeURIComponent(name)}`);
  const files = Array.isArray(json) ? json : json.results ?? json.data ?? [];
  for (const f of files) {
    if (f.id === keepId) continue;
    await fetch(`${STRAPI_URL}/api/upload/files/${f.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${TOKEN}` },
    }).catch(() => {});
  }
}

/** Every {{MARKER}} must appear exactly once — a dropped screenshot means a broken figure. */
function assertMarkers(html) {
  const problems = [];
  for (const m of MARKERS) {
    const n = (html.match(new RegExp(`\\{\\{${m}\\}\\}`, 'g')) ?? []).length;
    if (n !== 1) problems.push(`{{${m}}} appears ${n}× (expected 1)`);
  }
  const stray = [...html.matchAll(/\{\{(SCREENSHOT_[A-Z]+)\}\}/g)].map((x) => x[1]).filter((x) => !MARKERS.includes(x));
  if (stray.length) problems.push(`unknown markers: ${[...new Set(stray)].join(', ')}`);
  if (problems.length) throw new Error(`marker check failed:\n    ${problems.join('\n    ')}`);
}

const figure = ({ url, width, height, alt, caption }) =>
  `<figure><img src="${url}"${width ? ` width="${width}"` : ''}${height ? ` height="${height}"` : ''} alt="${alt}" loading="lazy" /><figcaption>${caption}</figcaption></figure>`;

// ── main ─────────────────────────────────────────────────────────────────────────
async function main() {
  if (!DRY_RUN) requireToken();
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. Resolve a currently-online model so the model shot points at a real room.
  const modelPath = (await firstLiveModelPath(FRONTEND)) ?? '/live-sex/chaturbate/';
  console.log(`Frontend: ${FRONTEND}  ·  model shot: ${modelPath}`);

  // 2. Screenshots (hub · provider grid · model room).
  console.log('Capturing screenshots (live NSFW pages)…');
  const shots = await captureShots({
    frontend: FRONTEND,
    outDir: OUT_DIR,
    shots: [
      { name: 'hub', path: '/live-sex/', waitFor: '[data-cam-card]' },
      { name: 'category', path: '/live-sex/chaturbate/', waitFor: '[data-cam-card]' },
      { name: 'model', path: modelPath, waitFor: 'video, iframe, h1', settleMs: 4_000 },
    ],
  });

  // 3. Cover.
  console.log('Building cover…');
  const cover = await buildCover({ outFile: join(OUT_DIR, 'cover.png') });

  // 4. Copy (OpenAI).
  console.log('Generating copy (gpt-5.5)…');
  const resp = await openai.chat.completions.create({
    model: 'gpt-5.5',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Write the PornMode Live Sex Cams launch announcement now. Slug: ${SLUG}.` },
    ],
    max_completion_tokens: 8000,
    response_format: { type: 'json_object' },
  });
  const raw = resp.choices[0]?.message?.content;
  if (!raw) throw new Error('No response from the model');
  const gen = JSON.parse(raw);
  for (const k of ['metaTitle', 'title', 'description', 'contentHtml', 'faqs']) {
    if (gen[k] == null) throw new Error(`model output missing "${k}"`);
  }
  assertMarkers(gen.contentHtml);
  console.log(`  title: ${gen.title}`);

  if (DRY_RUN) {
    console.log('\n── DRY RUN ─────────────────────────────────');
    console.log(`Screenshots + cover written to: ${OUT_DIR}`);
    console.log(`metaTitle: ${gen.metaTitle}`);
    console.log(`description: ${gen.description}`);
    console.log(`faqs: ${gen.faqs.length}`);
    console.log(`body: ${gen.contentHtml.length} chars, markers OK`);
    console.log('No Strapi writes. Re-run without --dry-run to upload + publish.');
    return;
  }

  // 5. Upload media (cover + 3 screenshots) FIRST — old copies are cleaned up only after the
  // article is rewritten to point at these new ones (see step 9).
  console.log('Uploading media to Strapi…');
  const COVER_NAME = 'pornmode-live-sex-cover.png';
  const coverUp = await uploadLocalFile(cover.file, COVER_NAME, 'image/png', 'image/');
  const upl = {};
  for (const name of ['hub', 'category', 'model']) {
    upl[name] = await uploadLocalFile(shots.get(name).file, `live-sex-${name}.png`, 'image/png', 'image/');
  }

  // 6. Fill screenshot markers with inline figures (root-relative /uploads/ — RichText adds the
  // host). Captions are for the reader, not a spec sheet — human, no URLs or page-structure talk.
  const captions = {
    SCREENSHOT_HUB: { url: upl.hub, alt: 'Live sex cams on PornMode', caption: 'Thousands of models live right now — take your pick.' },
    SCREENSHOT_CATEGORY: { url: upl.category, alt: 'Browsing live cams on PornMode', caption: 'Find your type: girls, guys, couples, trans, and every kink.' },
    SCREENSHOT_MODEL: { url: upl.model, alt: 'A live cam on PornMode', caption: 'Pick a room and watch someone live.' },
  };
  let body = gen.contentHtml;
  for (const m of MARKERS) {
    const c = captions[m];
    body = body.replace(`{{${m}}}`, figure({ url: c.url.url, width: c.url.width, height: c.url.height, alt: c.alt, caption: c.caption }));
  }

  // 7. Relations + postId.
  const authorId = await resolveDocId('authors', AUTHOR_SLUG);
  if (!authorId) throw new Error(`author not found: ${AUTHOR_SLUG}`);
  const categoryId = await resolveDocId('categories', CATEGORY_SLUG);
  if (!categoryId) console.warn(`  ⚠ category not found: ${CATEGORY_SLUG} — publishing without a category badge`);

  const bySlug = await articlesBySlug();
  const existing = bySlug.get(SLUG);
  const maxPostId = Math.max(0, ...[...bySlug.values()].map((a) => Number(a.postId) || 0));
  const postId = existing?.postId ?? maxPostId + 1;

  const data = {
    metaTitle: gen.metaTitle,
    title: gen.title,
    slug: SLUG,
    postId,
    description: gen.description,
    content: body,
    coverImage: coverUp.id,
    author: authorId,
    publishDate: new Date().toISOString(),
    faqs: (gen.faqs ?? []).map((f) => ({ question: f.question, answer: f.answer })),
  };
  if (categoryId) data.categories = [categoryId];

  // 8. Idempotent write.
  const saved = existing
    ? await updateArticle(existing.documentId, data)
    : await createArticle(data);

  // 9. The article now points at the new uploads — safe to remove the old same-named copies
  // from earlier runs (kept until here so a failure can never orphan a live reference).
  await deleteOldMediaByName(COVER_NAME, coverUp.id);
  for (const name of ['hub', 'category', 'model']) await deleteOldMediaByName(`live-sex-${name}.png`, upl[name].id);

  // The images live in Strapi now — delete the local scratch so nothing is left in the repo.
  rmSync(OUT_DIR, { recursive: true, force: true });

  console.log(`\n✅ ${existing ? 'updated' : 'created'}: postId=${saved.postId} slug=${saved.slug}`);
  console.log(`   ${FRONTEND}/blog/${saved.postId}/${saved.slug}/`);
  console.log('   Review locally, then promote: node scripts/push-changed-content.mjs --to staging --apply');
}

// Explicit exit: the OpenAI SDK / Playwright can leave a keep-alive handle open that stops
// node exiting on its own (a run that finished but "hangs" on exit).
main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('\n✗', err.message); process.exit(1); });
