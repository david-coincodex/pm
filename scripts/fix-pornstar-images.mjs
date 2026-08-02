#!/usr/bin/env node
/**
 * fix-pornstar-images.mjs
 *
 * Surgically backfills missing performer photos in already-generated pornstars-toplist
 * articles. It does NOT rewrite the copy — it only inserts an <img> above any ranked
 * `<h2>` that lacks one.
 *
 * Why a separate pass: the toplist scraper matched photos mostly by image src and
 * skipped lazy-loaded images (real URL in data-src, a data: placeholder in src). Many
 * source sites (xxxbios, sexiestpornstars, …) put the performer NAME in the alt text and
 * lazy-load the photo. This script resolves the real URL (data-src / srcset) and matches
 * by NAME IN ALT (full name, else all name tokens), so it reliably finds the right photo.
 *
 * Pipeline per article: read article (content + cover) → read its sources from
 * toplist-jobs.json → re-scrape sources for {src, alt} → for each ranked <h2> with no
 * image, match by name, re-host, insert. Sets a cover from the first match if missing.
 * Writes content back (draft); publish separately (document service).
 *
 * Usage:
 *   node scripts/fix-pornstar-images.mjs <slug> [<slug> …] [--dry-run] [--jobs <path>]
 *   node scripts/fix-pornstar-images.mjs --all          # every pornstars-toplist job
 *
 * Env (scripts/.env): STRAPI_URL, STRAPI_TOKEN
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: `${__dirname}/.env`, quiet: true });

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;
if (!TOKEN) { console.error('Error: STRAPI_TOKEN is required.'); process.exit(1); }
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const allMode = args.includes('--all');
const flagVal = (n) => { const i = args.indexOf(n); return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const jobsPath = flagVal('--jobs') || join(__dirname, 'toplist-jobs.json');
const consumed = new Set(); ['--jobs'].forEach((f) => { const i = args.indexOf(f); if (i !== -1) { consumed.add(i); consumed.add(i + 1); } });
const slugArgs = args.filter((a, i) => !a.startsWith('--') && !consumed.has(i));

const normKey = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const extFromUrl = (url, fb = '.jpg') => { try { const p = new URL(url).pathname; const e = p.slice(p.lastIndexOf('.')); return /^\.(jpe?g|png|webp|avif|gif)$/i.test(e) ? e : fb; } catch { return fb; } };

async function strapiFetch(path) {
  const res = await fetch(`${STRAPI_URL}/api${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}
async function getArticle(slug) {
  const { data } = await strapiFetch(`/articles?filters[slug][$eq]=${encodeURIComponent(slug)}&status=draft&fields[0]=content&fields[1]=title&populate[coverImage][fields][0]=url&pagination[pageSize]=1`);
  return data[0] ?? null;
}
async function updateArticleContent(documentId, content, coverId) {
  const data = { content };
  if (coverId) data.coverImage = coverId;
  const res = await fetch(`${STRAPI_URL}/api/articles/${documentId}`, { method: 'PUT', headers, body: JSON.stringify({ data }) });
  if (!res.ok) throw new Error(`update failed: ${res.status} ${await res.text()}`);
  return res.json();
}
async function uploadImageFromUrl(imageUrl, filename) {
  try {
    const res = await fetch(imageUrl, { headers: { 'User-Agent': USER_AGENT, Referer: 'https://www.google.com/' } });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2048) return null;
    const form = new FormData();
    form.append('files', new Blob([buf], { type: ct }), filename);
    const up = await fetch(`${STRAPI_URL}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form });
    if (!up.ok) return null;
    const [file] = await up.json();
    return file ? { id: file.id, url: file.url } : null;
  } catch { return null; }
}

// Re-scrape sources, resolving the REAL image URL and keeping the alt (which holds the name).
async function scrapeImages(urls) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: USER_AGENT })).newPage();
  const all = [];
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      const imgs = await page.evaluate(() => {
        const real = (img) => {
          let s = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') || '';
          if (!s) { const ss = img.getAttribute('srcset') || img.getAttribute('data-srcset'); if (ss) { const parts = ss.split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean); if (parts.length) s = parts[parts.length - 1]; } }
          if (!s) s = img.currentSrc || img.getAttribute('src') || '';
          return s;
        };
        const out = [];
        document.querySelectorAll('img').forEach((img) => {
          let src = real(img);
          if (!src || src.startsWith('data:') || /\.svg(\?|$)/i.test(src)) return;
          try { src = new URL(src, location.href).href; } catch { return; }
          if (/logo|sprite|icon|avatar|gravatar|placeholder|blank\.|spacer/i.test(src)) return;
          out.push({ src, alt: img.getAttribute('alt') || '' });
        });
        return out;
      });
      all.push(...imgs);
      console.log(`  📥 ${url} → ${imgs.length} imgs`);
    } catch (e) { console.log(`  ✗ scrape ${url}: ${e.message.slice(0, 60)}`); }
  }
  await browser.close();
  // dedupe by src
  const seen = new Set();
  return all.filter((i) => (seen.has(i.src) ? false : (seen.add(i.src), true)));
}

// Best image for a performer name: full-name match in alt/src beats all-tokens match; prefer earliest unused.
function matchImage(name, images, used) {
  const full = normKey(name);
  const tokens = name.split(/\s+/).map(normKey).filter((t) => t.length > 2);
  if (full.length < 4) return null;
  let best = null, bestScore = 0;
  for (const im of images) {
    if (used.has(im.src)) continue;
    const hay = normKey(`${im.alt} ${im.src}`);
    let score = 0;
    if (hay.includes(full)) score = 3;
    else if (tokens.length >= 2 && tokens.every((t) => hay.includes(t))) score = 2;
    if (score > bestScore) { best = im; bestScore = score; if (score === 3) break; }
  }
  return best;
}

const SKIP_HEADING = /^(faq|frequently|verdict|conclusion|final|how we|methodology|honou?rable|the bottom)/i;

// Ranked <h2> performer entries with whether an <img> already sits right before them.
function parseEntries(html) {
  const entries = [];
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>/g;
  let m;
  while ((m = re.exec(html))) {
    const inner = m[1].replace(/<[^>]+>/g, ' ').trim();
    const name = inner.replace(/^\s*\d+[.)]\s*/, '').split(/[—\-:|(]/)[0].trim();
    if (!name || SKIP_HEADING.test(inner)) continue;
    const before = html.slice(Math.max(0, m.index - 220), m.index);
    entries.push({ heading: m[0], name, hasImage: /<img\b/i.test(before) });
  }
  return entries;
}

function loadJobs() {
  if (!existsSync(jobsPath)) { console.error(`jobs config not found at ${jobsPath}`); process.exit(1); }
  return JSON.parse(readFileSync(jobsPath, 'utf-8'));
}

async function main() {
  const jobs = loadJobs();
  const targets = allMode ? jobs.filter((j) => j.type === 'pornstars-toplist') : jobs.filter((j) => slugArgs.includes(j.slug) || slugArgs.includes(j.id));
  if (targets.length === 0) { console.error('No matching jobs. Pass slugs/ids or --all.'); process.exit(1); }

  let totalPlaced = 0, totalMissing = 0;
  const touched = [];

  for (const job of targets) {
    console.log(`\n🌟 ${job.title || job.slug}  (/blog/${job.slug})`);
    const article = await getArticle(job.slug);
    if (!article) { console.log('  ⚠ article not found — skipping'); continue; }

    const entries = parseEntries(article.content);
    const missing = entries.filter((e) => !e.hasImage);
    console.log(`  entries: ${entries.length} | already have image: ${entries.length - missing.length} | missing: ${missing.length}`);
    if (missing.length === 0) { console.log('  ✓ nothing to fix'); continue; }

    const images = await scrapeImages(job.sources || []);
    console.log(`  source images: ${images.length}`);

    let html = article.content;
    const used = new Set();
    let placed = 0, firstUploadId = null;
    for (const e of missing) {
      const match = matchImage(e.name, images, used);
      if (!match) { console.log(`  🖼️  ${e.name}: no match`); totalMissing++; continue; }
      used.add(match.src);
      let imgUrl = match.src;
      if (!dryRun) {
        const up = await uploadImageFromUrl(match.src, `${job.slug}-${normKey(e.name)}${extFromUrl(match.src)}`);
        if (!up) { console.log(`  🖼️  ${e.name}: upload failed (${match.src.slice(0, 50)})`); totalMissing++; continue; }
        // RELATIVE, deliberately. Interpolating STRAPI_URL bakes the host that ran this script
        // into the stored article body; the frontend adds the media host at render instead.
        imgUrl = up.url;
        if (!firstUploadId) firstUploadId = up.id;
      }
      html = html.replace(e.heading, () => `<img src="${imgUrl}" alt="${e.name.replace(/"/g, '')}" />\n${e.heading}`);
      placed++; totalPlaced++;
      console.log(`  🖼️  ${e.name}: ${dryRun ? 'matched' : 'placed'} ← ${match.alt ? match.alt.slice(0, 48) : match.src.slice(-40)}`);
    }

    if (dryRun) { console.log(`  · dry-run: would place ${placed}/${missing.length}`); continue; }
    if (placed === 0) { console.log('  · no images placed — leaving article unchanged'); continue; }

    const needCover = !article.coverImage;
    await updateArticleContent(article.documentId, html, needCover ? firstUploadId : null);
    touched.push(job.slug);
    console.log(`  💾 updated: +${placed} images${needCover && firstUploadId ? ' (+cover)' : ''}`);
  }

  console.log('\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Images placed: ${totalPlaced} | still missing: ${totalMissing}`);
  if (touched.length) console.log(`Updated (republish these): ${touched.join(' ')}`);
  if (!dryRun && touched.length) console.log('→ Republish via the document service so the changes go live.');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
