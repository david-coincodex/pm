#!/usr/bin/env node
/**
 * generate-online-hours-article.mjs
 *
 * Generates the "see when models are usually online" UPDATE blog article (the usual-online-
 * hours schedule added to /live-sex model pages, issue #63) and writes it into local Strapi,
 * ready to be promoted with push-changed-content.mjs. Mirrors generate-launch-article.mjs —
 * one script + one prompt per article type is the convention here.
 *
 * Screenshot subject selection: the shot must actually SHOW the schedule, so instead of the
 * first live model we take the first live model whose page renders the "Usual online hours"
 * section (a data-poor model hides it and the shot would miss the whole point).
 *
 * Usage:
 *   node scripts/generate-online-hours-article.mjs [--dry-run]
 *   node scripts/generate-online-hours-article.mjs --author mike-wood --category live-sex \
 *        --slug see-when-cam-models-are-online --frontend http://localhost:3002
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
import { captureShots } from './lib/screenshots.mjs';
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
const AUTHOR_SLUG = flag('author', 'mike-wood');
const CATEGORY_SLUG = flag('category', 'live-sex');
const SLUG = flag('slug', 'see-when-cam-models-are-online');
const FRONTEND = (flag('frontend', 'http://localhost:3002')).replace(/\/+$/, '');
const OUT_DIR = join(tmpdir(), 'pm-online-hours-article');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) { console.error('Error: OPENAI_API_KEY is required (scripts/.env).'); process.exit(1); }
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const SYSTEM_PROMPT = readFileSync(join(__dirname, 'online-hours-article-prompt.md'), 'utf8');
const MARKERS = ['SCREENSHOT_MODEL', 'SCREENSHOT_HOURS'];
/** The rendered section label the shot must contain — mirrors messages/en.json usualOnlineHours. */
const SECTION_TEXT = 'Usual online hours';

async function resolveDocId(collection, slug) {
  const json = await api(`/${collection}?filters[slug][$eq]=${encodeURIComponent(slug)}&fields[0]=slug`);
  return json.data?.[0]?.documentId ?? null;
}

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

/**
 * First live model whose page actually renders the schedule section. The hub lists models by
 * viewers; the busiest ones are exactly the ones with rich histories, so this converges fast.
 */
async function firstModelWithSchedule() {
  const hub = await (await fetch(`${FRONTEND}/live-sex/`, { signal: AbortSignal.timeout(45_000) })).text();
  const paths = [...new Set([...hub.matchAll(/href="(\/live-sex\/(?:chaturbate|bongacams)\/[^"/]+\/)"/g)].map((m) => m[1]))];
  for (const path of paths.slice(0, 10)) {
    const html = await (await fetch(`${FRONTEND}${path}`, { signal: AbortSignal.timeout(45_000) })).text().catch(() => '');
    if (html.includes(SECTION_TEXT)) return path;
  }
  throw new Error(`none of the first ${Math.min(10, paths.length)} live models render "${SECTION_TEXT}" — is the heatmap deployed and backfilled?`);
}

async function main() {
  if (!DRY_RUN) requireToken();
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. A live model whose page shows the schedule — the whole point of both shots.
  const modelPath = await firstModelWithSchedule();
  console.log(`Frontend: ${FRONTEND}  ·  model: ${modelPath}`);

  // 2. Screenshots: the room up top, and the schedule scrolled into view.
  console.log('Capturing screenshots (live NSFW pages)…');
  const shots = await captureShots({
    frontend: FRONTEND,
    outDir: OUT_DIR,
    shots: [
      { name: 'model', path: modelPath, waitFor: `text=${SECTION_TEXT}` },
      { name: 'hours', path: modelPath, waitFor: `text=${SECTION_TEXT}`, scrollTo: `text=${SECTION_TEXT}`, settleMs: 4_000 },
    ],
  });

  // 3. Typographic cover.
  const cover = await buildCover({
    outFile: join(OUT_DIR, 'cover.png'),
    headline: 'See When She’s Online',
    kicker: 'NEW ON PORNMODE',
    subtitle: 'Every model’s page now shows her usual online hours · in your local time',
  });

  // 4. Copy (OpenAI).
  console.log('Generating copy (gpt-5.5)…');
  const resp = await openai.chat.completions.create({
    model: 'gpt-5.5',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'Write the update article now. Return the JSON object only.' },
    ],
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

  // 5. Upload media FIRST — old copies are cleaned up only after the article points at these.
  console.log('Uploading media to Strapi…');
  const COVER_NAME = 'pornmode-online-hours-cover.png';
  const coverUp = await uploadLocalFile(cover.file, COVER_NAME, 'image/png', 'image/');
  const upl = {};
  for (const name of ['model', 'hours']) {
    upl[name] = await uploadLocalFile(shots.get(name).file, `online-hours-${name}.png`, 'image/png', 'image/');
  }

  // 6. Fill markers. Captions for the reader, not a spec sheet.
  const captions = {
    SCREENSHOT_MODEL: { up: upl.model, alt: 'A live cam model page on PornMode', caption: 'Her page — live now, or see below when she usually is.' },
    SCREENSHOT_HOURS: { up: upl.hours, alt: 'A model’s usual online hours on PornMode', caption: 'Greener squares = more often live at that hour, shown in your local time.' },
  };
  let body = gen.contentHtml;
  for (const m of MARKERS) {
    const c = captions[m];
    body = body.replace(`{{${m}}}`, figure({ url: c.up.url, width: c.up.width, height: c.up.height, alt: c.alt, caption: c.caption }));
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

  // 9. Cleanup: old same-named media, then the local scratch dir.
  await deleteOldMediaByName(COVER_NAME, coverUp.id);
  for (const name of ['model', 'hours']) await deleteOldMediaByName(`online-hours-${name}.png`, upl[name].id);
  rmSync(OUT_DIR, { recursive: true, force: true });

  console.log(`\n${existing ? 'Updated' : 'Created'}: /blog/${postId}/${SLUG}/  (documentId ${saved.documentId ?? saved.data?.documentId})`);
  console.log('Promote with: node scripts/push-changed-content.mjs --only articles --apply');
}

main().catch((err) => { console.error(err); process.exit(1); });
