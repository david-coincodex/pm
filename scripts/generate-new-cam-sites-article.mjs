#!/usr/bin/env node
/**
 * generate-new-cam-sites-article.mjs
 *
 * Generates the "two more cam sites" UPDATE blog article (StripChat and imLive joining
 * Chaturbate and BongaCams, issue #82) and writes it into local Strapi, ready to be promoted
 * with push-changed-content.mjs. Mirrors generate-online-hours-article.mjs — one script + one
 * prompt per article type is the convention here.
 *
 * Screenshot subjects are the two new sites' own hub pages, each waited on until its grid has
 * actually painted cards: a shot of an empty grid would sell the opposite of the story. Both
 * are live NSFW pages, same as the other cam article shots.
 *
 * Usage:
 *   node scripts/generate-new-cam-sites-article.mjs [--dry-run]
 *   node scripts/generate-new-cam-sites-article.mjs --author mike-wood --category live-sex \
 *        --slug stripchat-and-imlive-cams-added --frontend http://localhost:3002
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
const SLUG = flag('slug', 'stripchat-and-imlive-cams-added');
const FRONTEND = (flag('frontend', 'http://localhost:3002')).replace(/\/+$/, '');
const OUT_DIR = join(tmpdir(), 'pm-new-cam-sites-article');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) { console.error('Error: OPENAI_API_KEY is required (scripts/.env).'); process.exit(1); }
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const SYSTEM_PROMPT = readFileSync(join(__dirname, 'new-cam-sites-article-prompt.md'), 'utf8');
const MARKERS = ['SCREENSHOT_STRIPCHAT', 'SCREENSHOT_IMLIVE'];
/** The two new sites, by hub slug — the shot subjects and the thing the article is about. */
const NEW_SITES = [
  { marker: 'SCREENSHOT_STRIPCHAT', name: 'StripChat', slug: 'stripchat', shot: 'stripchat' },
  { marker: 'SCREENSHOT_IMLIVE', name: 'imLive', slug: 'imlive', shot: 'imlive' },
];

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
 * Both new sites must be live and listing rooms before we publish a post announcing them.
 * Checks the hub returns 200 AND links at least this many of its own model pages — an empty
 * grid means the site's credentials are missing locally, and the screenshots would show a
 * barren page under a headline about twice the rooms.
 */
const MIN_CARDS = 12;

async function assertSitesLive() {
  for (const site of NEW_SITES) {
    const res = await fetch(`${FRONTEND}/live-sex/${site.slug}/`, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) throw new Error(`/live-sex/${site.slug}/ answered ${res.status} — is ${site.name} enabled on this frontend?`);
    const html = await res.text();
    const cards = new Set(
      [...html.matchAll(new RegExp(`href="(/live-sex/${site.slug}/[^"/]+/)"`, 'g'))].map((m) => m[1]),
    );
    if (cards.size < MIN_CARDS) {
      throw new Error(`/live-sex/${site.slug}/ lists only ${cards.size} rooms (need ${MIN_CARDS}) — check its API key`);
    }
    console.log(`  ${site.name}: ${cards.size} rooms listed`);
  }
}

async function main() {
  if (!DRY_RUN) requireToken();
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. Don't announce sites that aren't actually serving rooms here.
  console.log(`Frontend: ${FRONTEND}`);
  await assertSitesLive();

  // 2. Screenshots: each new site's grid, waited on until a card has actually painted.
  console.log('Capturing screenshots (live NSFW pages)…');
  const shots = await captureShots({
    frontend: FRONTEND,
    outDir: OUT_DIR,
    shots: NEW_SITES.map((site) => ({
      name: site.shot,
      path: `/live-sex/${site.slug}/`,
      waitFor: `a[href^="/live-sex/${site.slug}/"] img`,
      settleMs: 4_000,
    })),
  });

  // 3. The standard cover: wordmark + publish date (identical across articles by design).
  const cover = await buildCover({ outFile: join(OUT_DIR, 'cover.png') });

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
  // House style for update posts: "Update: <title> (Sep 2, 2026)" — uniform and self-dating,
  // pairing with the wordmark+date cover. The prompt is told not to add its own prefix/date.
  const dateShort = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  gen.title = `Update: ${gen.title.replace(/^Update:\s*/i, '')} (${dateShort})`;
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
  const COVER_NAME = 'pornmode-new-cam-sites-cover.png';
  const coverUp = await uploadLocalFile(cover.file, COVER_NAME, 'image/png', 'image/');
  const upl = {};
  for (const site of NEW_SITES) {
    upl[site.shot] = await uploadLocalFile(shots.get(site.shot).file, `new-cam-sites-${site.shot}.png`, 'image/png', 'image/');
  }

  // 6. Fill markers. Captions for the reader, not a spec sheet.
  const captions = {
    SCREENSHOT_STRIPCHAT: {
      up: upl.stripchat,
      alt: 'StripChat cam girls live on PornMode',
      caption: 'StripChat’s rooms, right in the grid — thousands more girls live at once.',
    },
    SCREENSHOT_IMLIVE: {
      up: upl.imlive,
      alt: 'imLive cam girls live on PornMode',
      caption: 'imLive’s free chat rooms — open one and she’s already streaming.',
    },
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
  for (const site of NEW_SITES) await deleteOldMediaByName(`new-cam-sites-${site.shot}.png`, upl[site.shot].id);
  rmSync(OUT_DIR, { recursive: true, force: true });

  console.log(`\n${existing ? 'Updated' : 'Created'}: /blog/${postId}/${SLUG}/  (documentId ${saved.documentId ?? saved.data?.documentId})`);
  console.log('Promote with: node scripts/push-changed-content.mjs --only articles --apply');
}

main().catch((err) => { console.error(err); process.exit(1); });
