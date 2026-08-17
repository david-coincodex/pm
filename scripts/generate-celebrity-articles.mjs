#!/usr/bin/env node
/**
 * generate-celebrity-articles.mjs
 *
 * Builds "<Celebrity> Nude Photos & Naked Sex Scenes" articles. Each nude scene becomes a
 * `commercial` record whose `site` is Mr. Skin — the player's promo CTA then sells the Mr. Skin
 * deal, because the full scenes live there. Pic-type sections (bikini photos, …) become
 * self-contained media-gallery widgets. Prose comes from GPT via the opaque-marker pattern
 * proven in generate-ad-articles.mjs: the model writes {{SCENE_n}}/{{GALLERY_n}} markers and
 * never sees an id or emits media markup.
 *
 * Three phases per job:
 *   0. --collect-from-article <postId>  bootstrap a job + manifest from an existing legacy
 *      article (its media is already in /uploads — resolved by URL, never re-uploaded)
 *   1. ingest: transcode/upload local media, upsert commercials, fetch Wikipedia context
 *   2. generate: GPT prose -> marker swap -> POST/PUT the article (published immediately)
 *
 * Usage:
 *   node scripts/generate-celebrity-articles.mjs [--all | jobId ...] --author <slug> [options]
 *   node scripts/generate-celebrity-articles.mjs --collect-from-article <postId>
 *
 * Options:
 *   --all             Process every job in the config
 *   --force           Replace an existing article / re-upload unchanged media / refresh context
 *   --republish       With --force: set publishDate to now and clear modifiedDate (fresh
 *                     publish) instead of preserving the original date and stamping an update
 *   --dry-run         Print what would happen; no Strapi writes, no OpenAI spend
 *   --ingest-only     Media + commercials + context, no article generation
 *   --generate-only   Skip ingest (manifest must already be complete)
 *   --jobs <path>     Jobs config (default: scripts/celebrity-jobs.json)
 *   --author <slug>   Author slug (required for generation unless --dry-run)
 *
 * Environment (scripts/.env): STRAPI_URL, STRAPI_TOKEN, OPENAI_API_KEY
 * Requires system ffmpeg/ffprobe when ingesting local clips.
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, openAsBlob } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import OpenAI from 'openai';
import { preflightPostIds } from './lib/jobs.mjs';

const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');
const cheerio = _require('cheerio');
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: `${__dirname}/.env`, quiet: true });

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const flagValue = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const has = (name) => process.argv.includes(`--${name}`);

const DRY_RUN = has('dry-run');
const FORCE = has('force');
const REPUBLISH = has('republish');
const INGEST_ONLY = has('ingest-only');
const GENERATE_ONLY = has('generate-only');
const COLLECT_POST_ID = flagValue('collect-from-article');
const JOBS_PATH = flagValue('jobs') ?? join(__dirname, 'celebrity-jobs.json');
const AUTHOR_SLUG = flagValue('author');
const MANIFEST_DIR = join(__dirname, 'data', 'celebrity-media');

// The site every celebrity article sells. Its offers drive the commercial widget's CTA.
const AFFILIATE_SITE_SLUG = 'mr-skin';

if (!TOKEN && !DRY_RUN) { console.error('Error: STRAPI_TOKEN is required.'); process.exit(1); }
if (!COLLECT_POST_ID && !INGEST_ONLY && !OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY is required.'); process.exit(1);
}
if (!COLLECT_POST_ID && !INGEST_ONLY && !DRY_RUN && !AUTHOR_SLUG) {
  console.error('Error: --author <slug> is required.'); process.exit(1);
}

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const SYSTEM_PROMPT = readFileSync(join(__dirname, 'celebrity-article-prompt.md'), 'utf8');

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slugify = (s) =>
  s.toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/&(amp|#0?38);/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);

// Same recipe as import-commercials.mjs: silent (-an keeps autoplay ungated), ≤720p, faststart.
const TRANSCODE_ARGS = (input, output) => [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-i', input,
  '-an',
  '-vf', "scale='min(1280,iw)':-2",
  '-c:v', 'libx264', '-profile:v', 'high', '-crf', '27', '-preset', 'slow',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  output,
];

const mimeFromUrl = (u) => {
  const ext = u.toLowerCase().split('?')[0].split('.').pop();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm' }[ext] ?? 'image/jpeg';
};

// ── Strapi plumbing ─────────────────────────────────────────────────────────────

/**
 * Upload a local file. Streams via openAsBlob. Mime is validated here because Strapi's
 * `allowedTypes` is enforced only by the admin media picker, not the REST API.
 */
async function uploadLocalFile(path, filename, type, expectPrefix, alternativeText) {
  if (expectPrefix && !type.startsWith(expectPrefix)) {
    throw new Error(`${filename}: expected ${expectPrefix}* but got ${type}`);
  }
  const form = new FormData();
  form.append('files', await openAsBlob(path, { type }), filename);
  if (alternativeText) form.append('fileInfo', JSON.stringify({ alternativeText }));
  const res = await fetch(`${STRAPI_URL}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` }, // no Content-Type: FormData sets the boundary
    body: form,
  });
  if (!res.ok) throw new Error(`upload ${filename}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const [file] = await res.json();
  return file ? { id: file.id, url: file.url } : null;
}

/** Resolve an already-uploaded file (relative /uploads/… URL) to its media id. */
async function findUploadByUrl(url) {
  const res = await fetch(
    `${STRAPI_URL}/api/upload/files?filters[url][$eq]=${encodeURIComponent(url)}`,
    { headers },
  );
  if (!res.ok) return null;
  const files = await res.json();
  const file = Array.isArray(files) ? files[0] : files?.results?.[0];
  return file ? { id: file.id, url: file.url, mime: file.mime, alt: file.alternativeText } : null;
}

function probeDuration(path) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', path,
    ], { encoding: 'utf8' });
    const secs = Math.round(parseFloat(out.trim()));
    return Number.isFinite(secs) ? secs : null;
  } catch { return null; }
}

/** Grab a frame ~1s in as the poster when the job supplies none. */
function extractPoster(clipPath, outPath) {
  try {
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', '1', '-i', clipPath, '-frames:v', '1', '-q:v', '3', outPath,
    ]);
    return existsSync(outPath) ? outPath : null;
  } catch { return null; }
}

async function findCommercialBySlug(slug) {
  const res = await fetch(
    `${STRAPI_URL}/api/commercials?filters[slug][$eq]=${encodeURIComponent(slug)}&fields[0]=slug&status=draft`,
    { headers },
  );
  if (!res.ok) return null;
  return (await res.json()).data?.[0] ?? null;
}

/** The affiliate site with offers — the model needs the deal's shape, the widgets its ids. */
async function getSite(slug) {
  const res = await fetch(
    `${STRAPI_URL}/api/sites?filters[slug][$eq]=${encodeURIComponent(slug)}` +
      `&fields[0]=name&fields[1]=slug&fields[2]=short_description&fields[3]=siteType` +
      `&populate[offers][fields][0]=price&populate[offers][fields][1]=full_price` +
      `&populate[offers][fields][2]=offerType&populate[offers][fields][3]=isActive`,
    { headers },
  );
  if (!res.ok) throw new Error(`site ${slug}: ${res.status}`);
  const site = (await res.json()).data?.[0];
  if (!site) throw new Error(`site not found: ${slug}`);
  return site;
}

/**
 * The deal's shape only — never figures. Body copy is static while the widgets render live
 * numbers, so a price in prose goes stale and contradicts the page.
 */
function describeOffer(site) {
  const active = (site.offers ?? []).filter((o) => o.isActive);
  if (!active.length) return 'No active offer on file — do not mention a discount.';
  const best = active.reduce((b, o) => {
    const d = o.full_price && o.full_price > o.price ? (o.full_price - o.price) / o.full_price : 0;
    const bd = b.full_price && b.full_price > b.price ? (b.full_price - b.price) / b.full_price : 0;
    return d > bd ? o : b;
  }, active[0]);
  const pct = best.full_price && best.full_price > best.price
    ? Math.round(((best.full_price - best.price) / best.full_price) * 100)
    : 0;
  const kinds = [...new Set(active.map((o) => o.offerType).filter(Boolean))].join(', ');
  return [
    `We have ${active.length} active offer(s)${kinds ? ` (${kinds})` : ''}.`,
    pct >= 50
      ? 'The best one is a heavy discount — you may call it a big/steep discount.'
      : pct > 0
        ? 'The best one is a modest discount — describe it as a discount, nothing stronger.'
        : 'No crossed-out original price, so do not imply a percentage saving.',
    'NEVER write a specific price, currency amount or percentage in the body — the offer',
    'widget at the top renders the live figures, and prose numbers would go stale.',
  ].join(' ');
}

async function resolveRelationIds(collection, slugs) {
  const out = [];
  for (const slug of slugs ?? []) {
    const res = await fetch(
      `${STRAPI_URL}/api/${collection}?filters[slug][$eq]=${encodeURIComponent(slug)}&fields[0]=slug`,
      { headers },
    );
    const item = res.ok ? (await res.json()).data?.[0] : null;
    if (item) out.push(item.documentId);
    else console.warn(`  ⚠ ${collection} not found: ${slug}`);
  }
  return out;
}

/**
 * Tags are one per celebrity, so a missing one is created rather than warn-skipped —
 * categories stay warn-only (creating `celebrities` is a one-time deliberate act).
 */
async function resolveOrCreateTags(job) {
  const out = [];
  for (const slug of job.tags ?? []) {
    const found = await fetch(
      `${STRAPI_URL}/api/tags?filters[slug][$eq]=${encodeURIComponent(slug)}&fields[0]=slug`,
      { headers },
    ).then((r) => (r.ok ? r.json() : { data: [] }));
    if (found.data?.[0]) { out.push(found.data[0].documentId); continue; }
    const name = slug === slugify(job.celebrity) ? job.celebrity
      : slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const res = await fetch(`${STRAPI_URL}/api/tags`, {
      method: 'POST', headers, body: JSON.stringify({ data: { name, slug } }),
    });
    if (!res.ok) { console.warn(`  ⚠ could not create tag ${slug}: ${res.status}`); continue; }
    out.push((await res.json()).data.documentId);
    console.log(`  created tag: ${name} (${slug})`);
  }
  return out;
}

/** publishDate comes along so a --force update can preserve it. */
async function findArticleBySlug(slug) {
  const res = await fetch(
    `${STRAPI_URL}/api/articles?filters[slug][$eq]=${encodeURIComponent(slug)}` +
      `&fields[0]=slug&fields[1]=publishDate&status=draft`,
    { headers },
  );
  if (!res.ok) return null;
  return (await res.json()).data?.[0] ?? null;
}

// ── Manifest ────────────────────────────────────────────────────────────────────

const manifestPath = (jobId) => join(MANIFEST_DIR, `${jobId}.json`);

function loadManifest(jobId) {
  const p = manifestPath(jobId);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { job: jobId, scenes: {}, galleries: {}, context: {} };
}

function saveManifest(jobId, manifest) {
  mkdirSync(MANIFEST_DIR, { recursive: true });
  writeFileSync(manifestPath(jobId), JSON.stringify(manifest, null, 2) + '\n');
}

// ── Phase 0: collect from an existing article ───────────────────────────────────

/**
 * Bootstrap a job from a legacy celebrity article that already lives in Strapi: h2 sections
 * with a <video> become scenes, image-only h2 sections become galleries, and every media URL
 * is resolved to its existing upload id — nothing is downloaded or re-uploaded.
 */
async function collectFromArticle(postId) {
  const res = await fetch(
    `${STRAPI_URL}/api/articles?filters[postId][$eq]=${postId}` +
      `&fields[0]=title&fields[1]=slug&fields[2]=postId&fields[3]=content&fields[4]=description`,
    { headers },
  );
  if (!res.ok) throw new Error(`article postId ${postId}: ${res.status}`);
  const article = (await res.json()).data?.[0];
  if (!article) throw new Error(`no article with postId ${postId}`);
  if (typeof article.content !== 'string') throw new Error('article content is not an HTML string');

  // "Alexandra Daddario Nude Photos & …" -> celebrity = everything before the qualifier.
  const celebrity = article.title.replace(/\s+(nude|naked|topless|sex)\b.*$/i, '').trim();
  const jobId = slugify(celebrity);

  const $ = cheerio.load(`<div id="pm-root">${article.content}</div>`, null, false);
  const root = $('#pm-root');

  const wikipediaUrl = root.find('a[href*="wikipedia.org/wiki/"]').first().attr('href') ?? null;

  // Split into sections on <h2> AND <h3>: legacy articles hang whole sub-scenes ("Closeup on
  // …") off h3s, and treating only h2s as boundaries would fold their videos into the parent.
  const sections = [];
  let current = { heading: null, nodes: [] };
  for (const el of root.children().toArray()) {
    if (el.tagName === 'h2' || el.tagName === 'h3') {
      sections.push(current);
      current = { heading: $(el).text().trim(), nodes: [] };
    } else {
      current.nodes.push(el);
    }
  }
  sections.push(current);

  const legacyText = root.text().replace(/\s+/g, ' ').trim();

  // "Sexy Alexandra Daddario Bikini Photos" -> "bikini"; "Alexandra Daddario's Nipples" -> "nipples"
  const galleryKind = (heading) =>
    slugify(
      heading
        .replace(new RegExp(celebrity, 'i'), '')
        .replace(/[’']s\b/gi, '')
        .replace(/\b(sexy|hot|nude|naked|photos?|pics?|pictures?)\b/gi, ''),
    ) || 'photos';

  const scenes = [];
  const galleries = [];
  // Media in headingless or conclusion sections would otherwise vanish — sweep it here.
  const strays = [];
  for (const section of sections) {
    const $nodes = $(section.nodes);
    const videos = $nodes.find('video').addBack('video').toArray();
    const imgs = $nodes.find('img').addBack('img').toArray().map((im) => ({
      url: $(im).attr('src'),
      alt: $(im).attr('alt') || undefined,
    })).filter((i) => i.url);
    const paragraphs = $nodes.filter('p').toArray().map((p) => $(p).text().trim()).filter(Boolean);

    const isContentSection = section.heading && !/^conclusion/i.test(section.heading);
    if (isContentSection && videos.length) {
      const show = section.heading.match(/[“"]([^”"]+)[”"]/)?.[1] ?? null;
      scenes.push({
        title: section.heading,
        show,
        imdbUrl: $nodes.find('a[href*="imdb.com"]').addBack('a[href*="imdb.com"]').first().attr('href') ?? null,
        description: paragraphs[0] ?? '',
        clipUrl: $(videos[0]).attr('src'),
        posterUrl: $(videos[0]).attr('poster') ?? null,
        stills: imgs,
      });
      // A second video in one section can't join the commercial (its gallery is images-only).
      for (const v of videos.slice(1)) strays.push({ url: $(v).attr('src') });
    } else if (isContentSection && imgs.length) {
      galleries.push({ kind: galleryKind(section.heading), headingHint: section.heading, images: imgs });
    } else {
      for (const v of videos) strays.push({ url: $(v).attr('src') });
      // Intro/conclusion images are decoration, not a photo set — only videos are swept.
    }
  }
  if (strays.filter((s) => s.url).length) {
    const kept = strays.filter((s) => s.url);
    console.warn(`  ⚠ ${kept.length} video(s) had no scene heading — collected into a "more" gallery; reassign in the job if wrong:`);
    kept.forEach((s) => console.warn(`     ${s.url}`));
    galleries.push({ kind: 'more', headingHint: `More ${celebrity} Nude Clips`, images: kept });
  }

  // Resolve every media URL to its existing upload — the whole point of collect mode.
  const missing = [];
  const resolve = async (url) => {
    if (!url) return null;
    const found = await findUploadByUrl(url);
    if (!found) missing.push(url);
    return found;
  };

  const manifest = loadManifest(jobId);
  manifest.celebrity = celebrity;
  manifest.legacyText = legacyText;

  for (const scene of scenes) {
    const slug = `${AFFILIATE_SITE_SLUG}-${slugify(scene.title)}`;
    const clip = await resolve(scene.clipUrl);
    const poster = await resolve(scene.posterUrl);
    const stills = [];
    for (const s of scene.stills) {
      const up = await resolve(s.url);
      if (up) stills.push({ ...up, alt: s.alt ?? up.alt ?? undefined });
    }
    manifest.scenes[slug] = {
      ...(manifest.scenes[slug] ?? {}),
      title: scene.title,
      clipId: clip?.id ?? null,
      clipUrl: scene.clipUrl,
      posterId: poster?.id ?? null,
      galleryIds: stills.map((s) => s.id),
      preResolved: true, // media already in /uploads — ingest skips transcode/upload
    };
  }
  for (const g of galleries) {
    const items = [];
    for (const [i, img] of g.images.entries()) {
      const up = await resolve(img.url);
      if (up) items.push({
        id: up.id, url: up.url, mime: up.mime ?? mimeFromUrl(up.url),
        alt: img.alt ?? up.alt ?? `${celebrity} ${g.kind} photo ${i + 1}`,
      });
    }
    manifest.galleries[g.kind] = { headingHint: g.headingHint, items, preResolved: true };
  }

  if (missing.length) {
    throw new Error(`media not found in Strapi uploads:\n    ${missing.join('\n    ')}`);
  }
  saveManifest(jobId, manifest);

  const skeleton = {
    id: jobId,
    celebrity,
    wikipediaUrl,
    title: article.title,
    slug: article.slug,
    postId: article.postId,
    categories: ['celebrities'],
    tags: [jobId],
    notes: '',
    scenes: scenes.map((s) => ({
      title: s.title,
      show: s.show,
      imdbUrl: s.imdbUrl,
      showWikipediaUrl: null,
      description: s.description,
      releaseDate: null,
      awards: null,
    })),
    galleries: galleries.map((g) => ({ kind: g.kind, headingHint: g.headingHint })),
  };

  console.log(`  collected ${scenes.length} scene(s), ${galleries.length} galler(ies) from "${article.title}"`);
  console.log(`  media resolved against existing uploads; manifest: data/celebrity-media/${jobId}.json`);
  console.log('\n  Job skeleton — merge into celebrity-jobs.json (fill show/description/awards/releaseDate):\n');
  console.log(JSON.stringify(skeleton, null, 2));
}

// ── Phase 1: ingest ─────────────────────────────────────────────────────────────

const sceneSlug = (scene) => `${AFFILIATE_SITE_SLUG}-${slugify(scene.title)}`;

/** Every media path a job references must exist before anything is spent or written. */
function preflightMediaPaths(job, manifest) {
  const missing = [];
  const check = (p) => { if (p && !existsSync(join(__dirname, p))) missing.push(p); };
  for (const scene of job.scenes ?? []) {
    const state = manifest.scenes[sceneSlug(scene)];
    if (state?.preResolved) continue; // media already in Strapi (collect mode)
    check(scene.clip);
    check(scene.poster);
    (scene.stills ?? []).forEach(check);
  }
  for (const g of job.galleries ?? []) {
    if (manifest.galleries[g.kind]?.preResolved) continue;
    (g.images ?? []).forEach((img) => check(typeof img === 'string' ? img : img.path));
  }
  if (missing.length) throw new Error(`missing media files:\n    ${missing.join('\n    ')}`);
}

async function ingestScene(job, scene, i, manifest, siteDocId) {
  const slug = sceneSlug(scene);
  const state = manifest.scenes[slug] ?? (manifest.scenes[slug] = {});
  const label = `scene ${i + 1}: ${scene.title}`;

  if (!scene.description) throw new Error(`${label}: description is required (commercial.description)`);

  let hash = state.sourceHash ?? null;
  let duration = state.durationSeconds ?? null;

  if (state.preResolved && state.clipId) {
    // Collect mode already pointed us at the existing upload — probe duration via a local copy.
    if (duration == null && state.clipUrl) {
      try {
        const tmp = join(tmpdir(), `pm-celeb-${slug}.mp4`);
        const res = await fetch(`${STRAPI_URL}${state.clipUrl}`);
        writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
        duration = probeDuration(tmp);
      } catch { /* duration stays null — VideoObject just omits it */ }
    }
  } else {
    const clipPath = join(__dirname, scene.clip);
    hash = createHash('sha256').update(readFileSync(clipPath)).digest('hex');
    if (state.sourceHash === hash && state.clipId && !FORCE) {
      console.log(`  ${label}: unchanged, skip media`);
    } else {
      if (DRY_RUN) { console.log(`  ${label}: would transcode + upload clip, ${scene.stills?.length ?? 0} still(s)`); return; }
      const out = join(tmpdir(), `pm-celeb-tc-${slug}.mp4`);
      execFileSync('ffmpeg', TRANSCODE_ARGS(clipPath, out));
      console.log(`  ${label}: transcoded ${(statSync(clipPath).size / 1048576).toFixed(2)} -> ${(statSync(out).size / 1048576).toFixed(2)} MB`);
      duration = probeDuration(out);
      const clipUp = await uploadLocalFile(out, `${slug}.mp4`, 'video/mp4', 'video/');
      state.clipId = clipUp?.id ?? null;
      state.clipUrl = clipUp?.url ?? null;

      let posterPath = scene.poster ? join(__dirname, scene.poster) : null;
      if (!posterPath) posterPath = extractPoster(out, join(tmpdir(), `pm-celeb-poster-${slug}.jpg`));
      if (posterPath) {
        const up = await uploadLocalFile(posterPath, `${slug}-poster.jpg`, mimeFromUrl(posterPath), 'image/');
        state.posterId = up?.id ?? null;
      }

      state.galleryIds = [];
      for (const [gi, still] of (scene.stills ?? []).entries()) {
        const p = join(__dirname, still);
        const alt = `${job.celebrity} nude in ${scene.show ?? scene.title} – still ${gi + 1}`;
        const up = await uploadLocalFile(p, `${slug}-${gi + 1}.${p.split('.').pop()}`, mimeFromUrl(p), 'image/', alt);
        if (up) state.galleryIds.push(up.id);
      }
      state.sourceHash = hash;
    }
  }
  state.durationSeconds = duration;

  if (DRY_RUN) { console.log(`  ${label}: would upsert commercial ${slug}`); return; }

  const data = {
    title: scene.title,
    slug,
    description: scene.description,
    clip: state.clipId,
    poster: state.posterId ?? null,
    gallery: state.galleryIds ?? [],
    site: siteDocId,
    sceneTitle: scene.show ?? null,
    sceneUrl: scene.imdbUrl ?? null,
    performers: job.celebrity,
    releaseDate: scene.releaseDate ?? null,
    durationSeconds: duration,
    popularity: job.scenes.length - i, // job order = editorial ranking
    sourceHash: hash,
  };
  const existing = await findCommercialBySlug(slug);
  const res = existing
    ? await fetch(`${STRAPI_URL}/api/commercials/${existing.documentId}`, {
        method: 'PUT', headers, body: JSON.stringify({ data }),
      })
    : await fetch(`${STRAPI_URL}/api/commercials`, {
        method: 'POST', headers, body: JSON.stringify({ data }),
      });
  if (!res.ok) throw new Error(`${label}: ${existing ? 'PUT' : 'POST'} ${res.status} ${(await res.text()).slice(0, 240)}`);
  const saved = (await res.json()).data;
  state.commercialId = saved.id;
  state.commercialDocumentId = saved.documentId;
  saveManifest(job.id, manifest);
  console.log(`  ${label}: ${existing ? 'updated' : 'created'} commercial ${slug}`);
}

async function ingestGallery(job, g, manifest) {
  const state = manifest.galleries[g.kind] ?? (manifest.galleries[g.kind] = { items: [] });
  state.headingHint = g.headingHint;
  if (state.preResolved) { console.log(`  gallery ${g.kind}: pre-resolved (${state.items.length} items)`); return; }

  const byPath = new Map((state.items ?? []).map((it) => [it.path, it]));
  const items = [];
  for (const [i, entry] of (g.images ?? []).entries()) {
    const path = typeof entry === 'string' ? entry : entry.path;
    const altOverride = typeof entry === 'string' ? null : entry.alt;
    const abs = join(__dirname, path);
    const hash = createHash('sha256').update(readFileSync(abs)).digest('hex');
    const prev = byPath.get(path);
    if (prev?.hash === hash && prev.id && !FORCE) { items.push(prev); continue; }
    const alt = altOverride ?? `${job.celebrity} ${g.kind} photo ${i + 1}`;
    if (DRY_RUN) { console.log(`  gallery ${g.kind}: would upload ${path}`); continue; }
    const up = await uploadLocalFile(abs, `${job.id}-${g.kind}-${i + 1}.${path.split('.').pop()}`, mimeFromUrl(path), 'image/', alt);
    if (up) items.push({ path, hash, id: up.id, url: up.url, mime: mimeFromUrl(path), alt });
  }
  if (!DRY_RUN) {
    state.items = items;
    saveManifest(job.id, manifest);
    console.log(`  gallery ${g.kind}: ${items.length} item(s) ready`);
  }
}

// ── Phase 1b: Wikipedia context ─────────────────────────────────────────────────

/**
 * Plaintext extract for a Wikipedia article URL, truncated. This is the only factual
 * source the model is allowed to use for actress/show claims.
 */
async function fetchWikipediaExtract(wikiUrl, maxChars) {
  const title = decodeURIComponent(new URL(wikiUrl).pathname.replace(/^\/wiki\//, ''));
  const api = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1` +
    `&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
  const res = await fetch(api, { headers: { 'User-Agent': 'pornmode-content-tool/1.0' } });
  if (!res.ok) throw new Error(`wikipedia ${title}: ${res.status}`);
  const pages = (await res.json())?.query?.pages ?? {};
  const extract = Object.values(pages)[0]?.extract;
  if (!extract) throw new Error(`wikipedia ${title}: no extract`);
  return extract.slice(0, maxChars);
}

async function enrichContext(job, manifest) {
  const ctx = manifest.context ?? (manifest.context = {});
  const want = [
    job.wikipediaUrl ? { key: 'celebrity', url: job.wikipediaUrl, max: 3000 } : null,
    ...(job.scenes ?? []).map((s, i) =>
      s.showWikipediaUrl ? { key: `scene-${i + 1}`, url: s.showWikipediaUrl, max: 1500 } : null),
  ].filter(Boolean);

  for (const { key, url, max } of want) {
    if (ctx[key]?.url === url && ctx[key]?.extract && !FORCE) continue;
    try {
      const extract = await fetchWikipediaExtract(url, max);
      ctx[key] = { url, fetchedAt: new Date().toISOString(), extract };
      console.log(`  context ${key}: ${extract.length} chars from ${url}`);
    } catch (err) {
      console.warn(`  ⚠ context ${key}: ${err.message}`);
    }
  }
  if (!DRY_RUN) saveManifest(job.id, manifest);
}

// ── Phase 2: generate ───────────────────────────────────────────────────────────

async function generate(job, site, manifest) {
  const ctx = manifest.context ?? {};
  const sceneContext = (job.scenes ?? [])
    .map((s, i) => {
      const state = manifest.scenes[sceneSlug(s)] ?? {};
      return [
        `SCENE_${i + 1}:`,
        `  title: ${s.title}`,
        s.show ? `  show/movie: ${s.show}` : null,
        s.awards ? `  awards/acclaim: ${s.awards}` : null,
        state.durationSeconds ? `  clip length: ${state.durationSeconds}s` : null,
        `  stills: ${(state.galleryIds ?? []).length}`,
        `  description (already rendered by the widget — do NOT repeat it): ${s.description}`,
        ctx[`scene-${i + 1}`]?.extract
          ? `  show context (verified — the only allowed source of facts about this show):\n    ${ctx[`scene-${i + 1}`].extract.replace(/\n+/g, ' ').slice(0, 1500)}`
          : null,
      ].filter(Boolean).join('\n');
    })
    .join('\n\n');

  const galleryContext = (job.galleries ?? [])
    .map((g, i) => {
      const state = manifest.galleries[g.kind] ?? { items: [] };
      return `GALLERY_${i + 1}: kind=${g.kind} | heading hint: ${g.headingHint} | ${state.items.length} photo(s)`;
    })
    .join('\n');

  const markers = [
    ...(job.scenes ?? []).map((_, i) => `{{SCENE_${i + 1}}}`),
    ...(job.galleries ?? []).map((_, i) => `{{GALLERY_${i + 1}}}`),
  ].join(' ');

  const user = [
    '## The celebrity this article is about',
    '',
    `- name: ${job.celebrity}`,
    job.wikipediaUrl ? `- wikipedia: ${job.wikipediaUrl}` : null,
    job.notes ? `- editor notes: ${job.notes}` : null,
    '',
    ctx.celebrity?.extract
      ? `Verified bio context (the ONLY allowed source of facts about ${job.celebrity}):\n${ctx.celebrity.extract}`
      : `No bio context available — write nothing about ${job.celebrity}'s life beyond the editor notes.`,
    '',
    '## The paysite the article sells',
    '',
    `- name: ${site.name}`,
    site.short_description ? `- what it is: ${site.short_description}` : null,
    `- our review page: /reviews/${site.slug}/ | our deal page: /discounts/${site.slug}/`,
    `- our offer: ${describeOffer(site)}`,
    '',
    '## Article',
    '',
    `- Title (use verbatim): ${job.title}`,
    `- Year: ${new Date().getUTCFullYear()}`,
    `- Scenes: ${(job.scenes ?? []).length} | Photo galleries: ${(job.galleries ?? []).length}`,
    '',
    `Place these markers, each exactly once, in this order: ${markers}`,
    '',
    'Scenes:',
    sceneContext,
    '',
    'Photo galleries:',
    galleryContext,
    manifest.legacyText
      ? `\n## Previous version of this article (reference for facts and voice — do not copy verbatim)\n${manifest.legacyText.slice(0, 4000)}`
      : null,
  ].filter((l) => l !== null).join('\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-5.5',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    max_completion_tokens: 8000,
    response_format: { type: 'json_object' },
  });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('No response from the model');
  return { data: JSON.parse(raw), usage: response.usage };
}

/**
 * Every marker exactly once and in order; no stray markers; no raw media/container markup.
 * Fail loudly before any Strapi write — a dropped marker is a scene nobody can find.
 */
function assertMarkers(html, sceneCount, galleryCount) {
  const problems = [];
  const expectOnce = (marker) => {
    const n = html.split(marker).length - 1;
    if (n !== 1) problems.push(`${marker} appears ${n} times (expected 1)`);
  };
  for (let i = 1; i <= sceneCount; i++) expectOnce(`{{SCENE_${i}}}`);
  for (let i = 1; i <= galleryCount; i++) expectOnce(`{{GALLERY_${i}}}`);
  const known = new Set([
    ...Array.from({ length: sceneCount }, (_, i) => `SCENE_${i + 1}`),
    ...Array.from({ length: galleryCount }, (_, i) => `GALLERY_${i + 1}`),
  ]);
  for (const m of html.matchAll(/\{\{([A-Z_0-9]+)\}\}/g)) {
    if (!known.has(m[1])) problems.push(`unexpected marker {{${m[1]}}}`);
  }
  const forbidden = html.match(/<(img|video|figure|div|iframe|script)\b/i);
  if (forbidden) problems.push(`forbidden element in contentHtml: <${forbidden[1]}>`);
  if (problems.length) throw new Error(`marker check failed:\n    ${problems.join('\n    ')}`);
}

/**
 * Swap markers for widget markup. `data-component` first, id immediately after, exactly one
 * space: the frontend prefetch regexes are attribute-order sensitive and fail SILENTLY.
 * split/join, not replace(): `$` in replacement text is a String.replace pattern.
 */
function placeWidgets(html, job, manifest) {
  let out = html;
  (job.scenes ?? []).forEach((scene, i) => {
    const state = manifest.scenes[sceneSlug(scene)];
    const widget =
      `<div data-component="commercial" data-commercial-id="${state.commercialDocumentId}" class="pm-widget pm-widget--commercial" contenteditable="false">` +
      `<span class="pm-widget__label">Scene ${i + 1}: ${escapeHtml(scene.title)}</span></div>`;
    out = out.split(`{{SCENE_${i + 1}}}`).join(widget);
  });
  (job.galleries ?? []).forEach((g, i) => {
    const state = manifest.galleries[g.kind];
    const items = state.items.map(({ url, mime, alt }) => ({ url, mime, ...(alt ? { alt } : {}) }));
    const widget =
      `<div data-component="media-gallery" class="pm-widget" contenteditable="false" data-items="${escapeHtml(JSON.stringify(items))}">` +
      `<span class="pm-widget__label">Media Gallery: ${items.length} item(s)</span></div>`;
    out = out.split(`{{GALLERY_${i + 1}}}`).join(widget);
  });
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function run(job) {
  const manifest = loadManifest(job.id);
  const site = await getSite(AFFILIATE_SITE_SLUG);
  if (!(site.offers ?? []).some((o) => o.isActive)) {
    throw new Error(`${site.name} has no active offer — the scene widgets would render no CTA`);
  }

  if (!GENERATE_ONLY) {
    preflightMediaPaths(job, manifest);
    const siteDocId = DRY_RUN ? '<site>' : site.documentId;
    for (const [i, scene] of (job.scenes ?? []).entries()) await ingestScene(job, scene, i, manifest, siteDocId);
    for (const g of job.galleries ?? []) await ingestGallery(job, g, manifest);
    await enrichContext(job, manifest);
  }
  if (INGEST_ONLY) return;

  // Everything the widgets reference must exist by now.
  for (const scene of job.scenes ?? []) {
    const state = manifest.scenes[sceneSlug(scene)];
    if (!state?.commercialDocumentId && !DRY_RUN) {
      throw new Error(`scene "${scene.title}" has no commercial — run ingest first`);
    }
  }
  for (const g of job.galleries ?? []) {
    if (!manifest.galleries[g.kind]?.items?.length) {
      throw new Error(`gallery "${g.kind}" has no uploaded items — run ingest first`);
    }
  }

  const existing = await findArticleBySlug(job.slug);
  if (existing && !FORCE && !DRY_RUN) {
    console.log(`  article "${job.slug}" exists — skipping (use --force to replace)`);
    return;
  }

  const { data: gen, usage } = await generate(job, site, manifest);
  console.log(`  generated (${usage?.total_tokens ?? '?'} tokens)`);

  assertMarkers(gen.contentHtml ?? '', (job.scenes ?? []).length, (job.galleries ?? []).length);

  let html = placeWidgets(gen.contentHtml, job, manifest);
  const siteCard =
    `<div data-component="site-card" data-site-id="${site.documentId}" class="pm-widget" contenteditable="false">` +
    `<span class="pm-widget__label">Site Card</span></div>`;
  html = siteCard + html;

  const faqs = (gen.faqs ?? [])
    .filter((f) => f?.question && f?.answer)
    .map((f) => ({ question: String(f.question), answer: String(f.answer) }));

  const payload = {
    metaTitle: gen.metaTitle || job.title,
    title: job.title,   // never model-generated: the H1 is pinned by the job
    slug: job.slug,     // pinned: slugify(title) would break the legacy URL
    postId: job.postId, // pinned: the production pornmode.com id
    description: gen.description || job.title,
    content: html,
    faqs,
  };

  const firstScene = manifest.scenes[sceneSlug(job.scenes[0])];
  if (firstScene?.posterId) payload.coverImage = firstScene.posterId;

  if (DRY_RUN) {
    console.log(`\n  metaTitle: ${payload.metaTitle}`);
    console.log(`  description: ${payload.description}`);
    console.log(`  slug/postId: ${payload.slug} / ${payload.postId}`);
    console.log(`  faqs: ${faqs.length}`);
    console.log(`  widgets: site-card=${(html.match(/data-component="site-card"/g) ?? []).length}` +
      ` scenes=${(html.match(/data-component="commercial"/g) ?? []).length}` +
      ` galleries=${(html.match(/data-component="media-gallery"/g) ?? []).length}`);
    console.log(`  content bytes: ${html.length}`);
    console.log(`\n${html.slice(0, 1500)}…`);
    return;
  }

  payload.author = (await resolveRelationIds('authors', [AUTHOR_SLUG]))[0];
  if (!payload.author) throw new Error(`author not found: ${AUTHOR_SLUG}`);
  const cats = await resolveRelationIds('categories', job.categories ?? []);
  const tags = await resolveOrCreateTags(job);
  if (cats.length) payload.categories = cats;
  if (tags.length) payload.tags = tags;

  if (existing && FORCE) {
    // In-place PUT, never delete+create (id/documentId churn breaks the canonical URL).
    // Default: keep the original publishDate — this is an update, not a fresh publish — and
    // stamp modifiedDate so the page can advertise freshness honestly. --republish flips
    // that: publishDate becomes now and modifiedDate clears, presenting a fresh publish
    // (reorders /blog and tells Google the post is new — use deliberately).
    if (REPUBLISH) {
      payload.publishDate = new Date().toISOString();
      payload.modifiedDate = null;
    } else {
      payload.publishDate = existing.publishDate ?? new Date().toISOString();
      payload.modifiedDate = new Date().toISOString();
    }
    const res = await fetch(`${STRAPI_URL}/api/articles/${existing.documentId}`, {
      method: 'PUT', headers, body: JSON.stringify({ data: payload }),
    });
    if (!res.ok) throw new Error(`PUT ${res.status} ${(await res.text()).slice(0, 240)}`);
    const saved = (await res.json()).data;
    console.log(`  updated in place: /blog/${saved.postId}/${saved.slug}/`);
  } else {
    payload.publishDate = new Date().toISOString();
    const res = await fetch(`${STRAPI_URL}/api/articles`, {
      method: 'POST', headers, body: JSON.stringify({ data: payload }),
    });
    if (!res.ok) throw new Error(`POST ${res.status} ${(await res.text()).slice(0, 240)}`);
    const saved = (await res.json()).data;
    console.log(`  created: /blog/${saved.postId}/${saved.slug}/`);
  }
}

// ── Entry ───────────────────────────────────────────────────────────────────────

if (COLLECT_POST_ID) {
  try {
    await collectFromArticle(Number(COLLECT_POST_ID));
    process.exit(0);
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
    process.exit(1);
  }
}

const jobs = JSON.parse(readFileSync(JOBS_PATH, 'utf8'));
const requested = process.argv.slice(2).filter((a, i, arr) => {
  if (a.startsWith('--')) return false;
  return !(i > 0 && ['--jobs', '--author', '--collect-from-article'].includes(arr[i - 1]));
});
const selected = has('all') ? jobs : jobs.filter((j) => requested.includes(j.id));

if (!selected.length) {
  console.error(`No jobs selected. Use --all or a job id.\nAvailable: ${jobs.map((j) => j.id).join(', ')}`);
  process.exit(1);
}

// postId collisions fail the whole batch up front — before media uploads or OpenAI spend.
if (!INGEST_ONLY) await preflightPostIds(selected);

let failed = 0;
for (const job of selected) {
  console.log(`\n=== ${job.id} ===`);
  try {
    await run(job);
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
    failed += 1;
  }
}
process.exit(failed ? 1 : 0);
