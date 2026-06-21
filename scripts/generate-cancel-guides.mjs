#!/usr/bin/env node
/**
 * generate-cancel-guides.mjs
 *
 * Refreshes our existing "How do I cancel <site>?" help articles. Each job points at
 * the original article on our live site (pornmode.com). The pipeline:
 *   scrape the article (text + screenshots, in order) → GPT-5.5 lightly refreshes the
 *   copy while KEEPING the step screenshots in place → re-host each screenshot to our
 *   media → create an Article with the SAME slug (cover + inline screenshots + FAQs).
 *
 * Unlike generate-toplists.mjs, this is single-source (our own article), preserves the
 * inline screenshots in their original order, and does not rank/embed catalog sites.
 *
 * Usage:
 *   node scripts/generate-cancel-guides.mjs [--all | jobId ...] --author <slug> [options]
 *
 * Options:
 *   --all            Process every job in the config
 *   --force          Replace an existing article with the same slug (default: skip)
 *   --publish        Publish immediately (see caveat: REST publish is unreliable on v5;
 *                    prefer the document-service publish — see generate-faqs.md)
 *   --dry-run        Print the generated JSON; no scraping writes, no Strapi writes
 *   --jobs <path>    Jobs config (default: scripts/cancel-jobs.json)
 *   --author <slug>  Author slug (required unless --dry-run)
 *
 * Environment (scripts/.env): STRAPI_URL, STRAPI_TOKEN, OPENAI_API_KEY
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import OpenAI from 'openai';

const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: `${__dirname}/.env`, quiet: true });

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!TOKEN) { console.error('Error: STRAPI_TOKEN is required.'); process.exit(1); }
if (!OPENAI_API_KEY) { console.error('Error: OPENAI_API_KEY is required.'); process.exit(1); }

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CURRENT_YEAR = new Date().getFullYear();

const PRICE = { 'gpt-5.5': { in: Number(process.env.OPENAI_PRICE_GPT55_IN ?? 1.25), out: Number(process.env.OPENAI_PRICE_GPT55_OUT ?? 10) } };
const costOf = (model, usage) => { const p = PRICE[model]; return !p || !usage ? 0 : ((usage.prompt_tokens || 0) * p.in + (usage.completion_tokens || 0) * p.out) / 1e6; };
const tok = (u) => (u ? `${u.prompt_tokens}→${u.completion_tokens}` : 'n/a');

const SYSTEM_PROMPT = readFileSync(join(__dirname, 'cancel-prompt.md'), 'utf-8');

// ── CLI ────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const allMode = args.includes('--all');
const forceMode = args.includes('--force');
const publishMode = args.includes('--publish');
const dryRun = args.includes('--dry-run');
function flagValue(name) { const i = args.indexOf(name); return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; }
const authorSlug = flagValue('--author');
const jobsPath = flagValue('--jobs') || join(__dirname, 'cancel-jobs.json');
const consumed = new Set();
['--author', '--jobs'].forEach((f) => { const i = args.indexOf(f); if (i !== -1) { consumed.add(i); consumed.add(i + 1); } });
const jobIds = args.filter((a, i) => !a.startsWith('--') && !consumed.has(i));

if (!allMode && jobIds.length === 0) {
  console.error('Usage: node scripts/generate-cancel-guides.mjs [--all | jobId ...] --author <slug> [--publish] [--force] [--dry-run] [--jobs <path>]');
  process.exit(1);
}
if (!dryRun && !authorSlug) { console.error('Error: --author <slug> is required (or use --dry-run).'); process.exit(1); }

// ── Helpers ──────────────────────────────────────────────────────────────────────
const extFromUrl = (url, fallback = '.jpg') => { try { const p = new URL(url).pathname; const e = p.slice(p.lastIndexOf('.')); return /^\.(jpe?g|png|webp|avif|gif)$/i.test(e) ? e : fallback; } catch { return fallback; } };
const normKey = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function strapiFetch(path) {
  const res = await fetch(`${STRAPI_URL}/api${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}
async function fetchAuthor(slug) { const { data } = await strapiFetch(`/authors?filters[slug][$eq]=${encodeURIComponent(slug)}`); return data[0] ?? null; }
async function articleExists(slug) { const { data } = await strapiFetch(`/articles?filters[slug][$eq]=${encodeURIComponent(slug)}&pagination[pageSize]=1`); return data[0] ?? null; }
async function createArticle(data) {
  const res = await fetch(`${STRAPI_URL}/api/articles`, { method: 'POST', headers, body: JSON.stringify({ data }) });
  if (!res.ok) throw new Error(`Create article failed: ${res.status} ${await res.text()}`);
  return res.json();
}
async function deleteArticle(documentId) {
  const res = await fetch(`${STRAPI_URL}/api/articles/${documentId}`, { method: 'DELETE', headers });
  if (!res.ok && res.status !== 204) throw new Error(`Delete failed: ${res.status} ${await res.text()}`);
}
async function publishArticle(documentId) {
  const res = await fetch(`${STRAPI_URL}/api/articles/${documentId}`, { method: 'PUT', headers, body: JSON.stringify({ data: { publishedAt: new Date().toISOString() } }) });
  if (!res.ok) throw new Error(`Publish failed: ${res.status} ${await res.text()}`);
}
async function resolveRelationIds(collection, slugs) {
  if (!slugs?.length) return [];
  const ids = [];
  for (const slug of slugs) { const { data } = await strapiFetch(`/${collection}?filters[slug][$eq]=${encodeURIComponent(slug)}&pagination[pageSize]=1`); if (data[0]) ids.push(data[0].documentId); }
  return ids;
}
async function uploadImageFromUrl(imageUrl, filename) {
  try {
    const res = await fetch(imageUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return null;
    const form = new FormData();
    form.append('files', new Blob([buf], { type: ct }), filename);
    const up = await fetch(`${STRAPI_URL}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form });
    if (!up.ok) return null;
    const [file] = await up.json();
    return file ? { id: file.id, url: file.url } : null;
  } catch { return null; }
}

// ── Scrape one article: title + text with {{IMAGE_n}} markers + ordered images ────
async function scrapeArticle(url) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: USER_AGENT })).newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    const data = await page.evaluate(() => {
      const pick = () => {
        for (const s of ['article', '.entry-content', '.post-content', 'main', '[role="main"]', '.content']) {
          const el = document.querySelector(s);
          if (el && el.innerText.trim().length > 300) return el;
        }
        return document.body;
      };
      const root = pick();
      root.querySelectorAll('script,style,nav,header,footer,aside,form,iframe,noscript,button,[class*="share"],[class*="related"],[class*="comment"],[class*="sidebar"],[class*="breadcrumb"]').forEach((e) => e.remove());
      const title = (document.querySelector('h1')?.innerText || document.querySelector('meta[property="og:title"]')?.content || document.title || '').trim();
      const og = document.querySelector('meta[property="og:image"]')?.content || null;
      // Normalize a media URL to its basename (drop query + WP "-300x200" size suffix)
      // so the hero/featured image can be matched against inline content images.
      const norm = (u) => { try { u = u.split('?')[0]; return u.substring(u.lastIndexOf('/') + 1).replace(/-\d+x\d+(?=\.[a-z]+$)/i, '').toLowerCase(); } catch { return u; } };
      const ogNorm = og ? norm(og) : null;
      const images = [];
      root.querySelectorAll('img').forEach((img) => {
        const src = img.currentSrc || img.getAttribute('src') || img.src;
        if (!src || src.startsWith('data:') || /\.svg(\?|$)/i.test(src)) return;
        const w = img.naturalWidth || 0, h = img.naturalHeight || 0;
        if (w && h && (w < 200 || h < 150)) return; // skip icons/logos
        if (ogNorm && norm(src) === ogNorm) { img.remove(); return; } // hero == cover; don't duplicate inline
        images.push({ src, alt: img.alt || '' });
        img.replaceWith(document.createTextNode(`\n{{IMAGE_${images.length}}}\n`));
      });
      const markedText = root.innerText.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 14000);
      return { title, og, markedText, images };
    });
    console.log(`  📥 scraped ${url} (${data.markedText.length} chars, ${data.images.length} screenshots)`);
    return data;
  } finally {
    await browser.close();
  }
}

// ── Generate (GPT-5.5) ────────────────────────────────────────────────────────────
async function refresh(job, scraped) {
  const user = `# Refresh this "How do I cancel" article\n\n`
    + `- Site: ${job.siteName || job.site || ''}\n`
    + `- Current year: ${CURRENT_YEAR}\n`
    + `- Original title: ${scraped.title || ''}\n`
    + `- Screenshot markers present: ${scraped.images.map((_, i) => `{{IMAGE_${i + 1}}}`).join(' ') || '(none)'}\n\n`
    + `## Original article (text with {{IMAGE_n}} markers — keep markers exactly, in place)\n\n${scraped.markedText}\n`;
  const response = await openai.chat.completions.create({
    model: 'gpt-5.5',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }],
    max_completion_tokens: 5000,
    response_format: { type: 'json_object' },
  });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('No response from GPT-5.5');
  return { data: JSON.parse(raw), usage: response.usage };
}

// Replace {{IMAGE_n}} markers with re-hosted <img>; drop markers whose upload failed.
async function placeImages(html, images, slug, isDry) {
  let placed = 0, missing = 0;
  for (let i = 0; i < images.length; i++) {
    const marker = `{{IMAGE_${i + 1}}}`;
    if (!html.includes(marker)) { missing++; continue; }
    const alt = images[i].alt || `${slug} cancellation step ${i + 1}`;
    let imgUrl = null;
    if (isDry) imgUrl = images[i].src;
    else { const up = await uploadImageFromUrl(images[i].src, `${slug}-step-${i + 1}${extFromUrl(images[i].src)}`); if (up) imgUrl = `${STRAPI_URL}${up.url}`; }
    const tag = imgUrl ? `<img src="${imgUrl}" alt="${alt.replace(/"/g, '')}" />` : '';
    if (imgUrl) placed++;
    html = html.split(marker).join(tag); // literal replace (URLs may contain $)
  }
  // Strip any leftover markers the model added/kept beyond our image count.
  html = html.replace(/\{\{IMAGE_\d+\}\}/g, '');
  return { html, placed, missing };
}

// Existing media id for a site's own cover/logo — fallback cover when there's no og:image.
async function fetchSiteCoverMediaId(slug) {
  if (!slug) return null;
  try {
    const { data } = await strapiFetch(`/sites?filters[slug][$eq]=${encodeURIComponent(slug)}&populate[cover_image][fields][0]=url&populate[logo][fields][0]=url&pagination[pageSize]=1`);
    const m = data[0]?.cover_image ?? data[0]?.logo;
    return m?.id ?? null;
  } catch { return null; }
}

// ── Main ──────────────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(jobsPath)) { console.error(`Error: jobs config not found at ${jobsPath}.`); process.exit(1); }
  const allJobs = JSON.parse(readFileSync(jobsPath, 'utf-8'));
  const jobs = allMode ? allJobs : allJobs.filter((j) => jobIds.includes(j.id));
  if (jobs.length === 0) { console.error('No matching jobs.'); process.exit(1); }

  let author = null;
  if (!dryRun) { author = await fetchAuthor(authorSlug); if (!author) { console.error(`Author "${authorSlug}" not found.`); process.exit(1); } }

  console.log(`Current year: ${CURRENT_YEAR}. Jobs: ${jobs.length}.\n`);
  let created = 0, skipped = 0, failed = 0, totalCost = 0;

  for (const job of jobs) {
    const slug = job.slug;
    console.log(`\n🧾 ${job.siteName || job.site || slug}  → /blog/${slug}`);
    try {
      if (!dryRun) {
        const existing = await articleExists(slug);
        if (existing && !forceMode) { console.log('  ⏭  article with this slug exists — skipping (use --force).'); skipped++; continue; }
        if (existing && forceMode) { await deleteArticle(existing.documentId); console.log('  🗑  deleted existing article (force)'); }
      }

      const scraped = await scrapeArticle(job.source);
      if (!scraped.markedText || scraped.markedText.length < 200) throw new Error('scrape produced too little content');

      console.log('  🤖 refreshing with GPT-5.5...');
      const { data: gen, usage } = await refresh(job, scraped);
      if (!gen.contentHtml || !gen.title) throw new Error('GPT response missing title/contentHtml');
      const cost = costOf('gpt-5.5', usage); totalCost += cost;
      console.log(`  💵 gpt-5.5 ${tok(usage)} | est. $${cost.toFixed(4)}`);

      const { html, placed, missing } = await placeImages(gen.contentHtml, scraped.images, slug, dryRun);
      console.log(`  🖼️  screenshots: ${placed} placed${missing ? `, ${missing} marker(s) missing from copy` : ''} / ${scraped.images.length} scraped`);

      // Cover: prefer the article's og:image (the featured/hero, excluded from inline);
      // otherwise fall back to the site's own cover so we never reuse a step screenshot.
      let coverId = null, coverFrom = 'none';
      if (scraped.og && !dryRun) { const up = await uploadImageFromUrl(scraped.og, `${slug}-cover${extFromUrl(scraped.og)}`); if (up) { coverId = up.id; coverFrom = 'og'; } }
      if (!coverId && !dryRun) { const sid = await fetchSiteCoverMediaId(job.site); if (sid) { coverId = sid; coverFrom = 'site'; } }
      if (dryRun) coverFrom = scraped.og ? 'og' : (job.site ? 'site(maybe)' : 'none');

      const faqs = Array.isArray(gen.faqs) ? gen.faqs.filter((f) => f?.question && f?.answer).map((f) => ({ question: f.question, answer: f.answer })) : [];

      if (dryRun) {
        console.log('  · dry-run output:');
        console.log(JSON.stringify({ title: gen.title, slug, metaTitle: gen.metaTitle, description: gen.description, faqs: faqs.length, screenshots: { scraped: scraped.images.length, placed }, cover: coverFrom, contentPreview: html.slice(0, 700) }, null, 2));
        continue;
      }

      const data = {
        metaTitle: gen.metaTitle || gen.title,
        title: gen.title,
        slug,
        description: gen.description || gen.title,
        content: html,
        faqs,
        author: author.documentId,
        publishDate: new Date().toISOString(),
      };
      if (coverId) data.coverImage = coverId;
      const cats = await resolveRelationIds('categories', job.categories);
      const tags = await resolveRelationIds('tags', job.tags);
      if (cats.length) data.categories = cats;
      if (tags.length) data.tags = tags;

      const { data: createdArticle } = await createArticle(data);
      if (publishMode) await publishArticle(createdArticle.documentId);
      created++;
      console.log(`  💾 saved ${publishMode ? 'published' : 'draft'}: ${slug} | FAQs: ${faqs.length} | cover: ${coverFrom}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${slug}: ${err.message}`);
    }
  }

  console.log('\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Jobs: ${jobs.length} | Created: ${created} | Skipped: ${skipped} | Failed: ${failed}`);
  console.log(`Estimated OpenAI cost: $${totalCost.toFixed(4)}`);
  console.log(dryRun ? 'Mode: dry-run' : publishMode ? 'Mode: published' : 'Mode: draft (publish in admin or via document service)');
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
