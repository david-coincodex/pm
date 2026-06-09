#!/usr/bin/env node
/**
 * generate-toplists.mjs
 *
 * Generates fresh "toplist" blog articles with GPT-5.5 from multiple external
 * sources + our own site/review data, and saves them as draft Articles in Strapi.
 *
 * Pipeline per job:
 *   scrape sources (Playwright) → consolidate+validate context (GPT-4o, drops
 *   gibberish) → generate article (GPT-5.5) using context + our catalog/reviews
 *   → sanitize widgets to catalog IDs → rehost images → create draft Article.
 *
 * FAQs are written to the structured `faqs` component. A cover image and inline
 * images are picked from the source listicles and re-hosted to our media.
 *
 * Usage:
 *   node scripts/generate-toplists.mjs [options] [jobId1 jobId2 ...]
 *
 * Options:
 *   --all             Process every job in the config
 *   --force           Recreate even if an article with the slug exists
 *   --author <slug>   Author slug for the article (REQUIRED unless --dry-run)
 *   --publish         Publish immediately (default: draft)
 *   --no-scrape       Skip scraping external sources (use our data only)
 *   --dry-run         Print generated JSON; do not write to Strapi
 *   --jobs <path>     Jobs config file (default: ./toplist-jobs.json)
 *
 * Environment: STRAPI_URL, STRAPI_TOKEN, OPENAI_API_KEY
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import OpenAI from 'openai';

const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: `${__dirname}/.env` });

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!TOKEN) { console.error('Error: STRAPI_TOKEN is required.'); process.exit(1); }
if (!OPENAI_API_KEY) { console.error('Error: OPENAI_API_KEY is required.'); process.exit(1); }

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CURRENT_YEAR = new Date().getFullYear();

const SYSTEM_PROMPT = readFileSync(join(__dirname, 'toplist-prompt.md'), 'utf-8');
const ELEMENTS_PROMPT = readFileSync(join(__dirname, 'toplist-elements.md'), 'utf-8');
const CONSOLIDATE_PROMPT = readFileSync(join(__dirname, 'toplist-consolidate-prompt.md'), 'utf-8');

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const allMode = args.includes('--all');
const forceMode = args.includes('--force');
const publishMode = args.includes('--publish');
const noScrape = args.includes('--no-scrape');
const dryRun = args.includes('--dry-run');

function flagValue(name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}
const authorSlug = flagValue('--author');
const jobsPath = flagValue('--jobs') || join(__dirname, 'toplist-jobs.json');

const consumed = new Set();
['--author', '--jobs'].forEach((f) => { const i = args.indexOf(f); if (i !== -1) { consumed.add(i); consumed.add(i + 1); } });
const jobIds = args.filter((a, i) => !a.startsWith('--') && !consumed.has(i));

if (!allMode && jobIds.length === 0) {
  console.error('Usage: node scripts/generate-toplists.mjs [--all | jobId ...] --author <slug> [--publish] [--force] [--no-scrape] [--dry-run] [--jobs <path>]');
  process.exit(1);
}
if (!dryRun && !authorSlug) { console.error('Error: --author <slug> is required (or use --dry-run).'); process.exit(1); }

// ── Helpers ────────────────────────────────────────────────────────────────────
const slugify = (s) => s.toLowerCase().trim().replace(/['"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const truncate = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s || '');
const extFromUrl = (url, fallback = '.jpg') => {
  try { const p = new URL(url).pathname; const e = p.slice(p.lastIndexOf('.')); return /^\.(jpe?g|png|webp|avif|gif)$/i.test(e) ? e : fallback; } catch { return fallback; }
};

async function strapiFetch(path) {
  const res = await fetch(`${STRAPI_URL}/api${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchAuthor(slug) {
  const { data } = await strapiFetch(`/authors?filters[slug][$eq]=${encodeURIComponent(slug)}`);
  return data[0] ?? null;
}
async function articleExists(slug) {
  const { data } = await strapiFetch(`/articles?filters[slug][$eq]=${encodeURIComponent(slug)}&pagination[pageSize]=1`);
  return data[0] ?? null;
}

async function fetchCatalog() {
  const catalog = [];
  let page = 1;
  while (true) {
    const { data, meta } = await strapiFetch(`/sites?fields[0]=name&fields[1]=slug&filters[isActive][$eq]=true&pagination[page]=${page}&pagination[pageSize]=100`);
    catalog.push(...data.map((s) => ({ id: s.id, name: s.name, slug: s.slug })));
    if (page >= (meta?.pagination?.pageCount ?? 1)) break;
    page++;
  }
  return catalog;
}

const SITE_FIELDS = 'fields[0]=name&fields[1]=slug&fields[2]=short_description&fields[3]=externalContext&populate[offers][fields][0]=price&populate[offers][fields][1]=isActive&populate[categories][fields][0]=slug';

function toCandidate(s) {
  const offers = (s.offers ?? []).filter((o) => o.isActive);
  const best = offers.length ? [...offers].sort((a, b) => a.price - b.price)[0] : null;
  const ctx = s.externalContext || null;
  const opinionQuotes = Array.isArray(ctx?.reviewerOpinions)
    ? ctx.reviewerOpinions
        .map((o) => ({ text: o.quotableSnippet || o.verdict, source: o.sourceName }))
        .filter((q) => q.text && q.source)
        .slice(0, 2)
    : [];
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    shortDescription: s.short_description ?? null,
    bestPrice: best ? best.price : null,
    highlights: ctx?.contentHighlights ?? null,
    opinionQuotes,
  };
}

async function fetchSiteBySlug(slug) {
  const { data } = await strapiFetch(`/sites?${SITE_FIELDS}&filters[slug][$eq]=${encodeURIComponent(slug)}&filters[isActive][$eq]=true&pagination[pageSize]=1`);
  return data[0] ?? null;
}
async function fetchSitesByCategory(categorySlug) {
  const { data } = await strapiFetch(`/sites?${SITE_FIELDS}&filters[isActive][$eq]=true&filters[categories][slug][$eq]=${encodeURIComponent(categorySlug)}&sort=name:asc&pagination[pageSize]=40`);
  return data.map(toCandidate);
}
async function fetchSimilarSites(refSite) {
  const catSlugs = (refSite.categories ?? []).map((c) => c.slug).filter(Boolean);
  if (catSlugs.length === 0) return [];
  const filt = catSlugs.map((s, i) => `filters[categories][slug][$in][${i}]=${encodeURIComponent(s)}`).join('&');
  const { data } = await strapiFetch(`/sites?${SITE_FIELDS}&filters[isActive][$eq]=true&${filt}&sort=name:asc&pagination[pageSize]=40`);
  return data.filter((s) => s.slug !== refSite.slug).map(toCandidate);
}
async function fetchReviewForSite(slug) {
  const { data } = await strapiFetch(`/reviews?filters[site][slug][$eq]=${encodeURIComponent(slug)}&filters[publishedAt][$notNull]=true&fields[0]=overallScore&fields[1]=description&pagination[pageSize]=1`);
  const r = data[0];
  return r ? { slug, overallScore: r.overallScore ?? null, description: r.description ?? null } : null;
}
async function resolveRelationIds(collection, slugs) {
  if (!slugs?.length) return [];
  const ids = [];
  for (const slug of slugs) {
    const { data } = await strapiFetch(`/${collection}?filters[slug][$eq]=${encodeURIComponent(slug)}&pagination[pageSize]=1`);
    if (data[0]) ids.push(data[0].documentId);
  }
  return ids;
}

// ── Media upload ──────────────────────────────────────────────────────────────
async function uploadImageFromUrl(imageUrl, filename) {
  try {
    const res = await fetch(imageUrl, { headers: { 'User-Agent': USER_AGENT } });
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

// ── Scraping (Playwright): text + images per source ────────────────────────────
async function scrapeSources(urls) {
  if (noScrape || !urls?.length) return [];
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();
  const out = [];
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      const { content, images } = await page.evaluate(() => {
        const pickText = () => {
          const sels = ['article', '[role="main"]', 'main', '.entry-content', '.post-content', '.content'];
          for (const s of sels) { const el = document.querySelector(s); if (el && el.innerText.trim().length > 500) return el.innerText; }
          return document.body.innerText;
        };
        const imgs = [];
        const og = document.querySelector('meta[property="og:image"]')?.content;
        if (og) imgs.push({ src: og, alt: 'cover', w: 1200, h: 630, og: true });
        document.querySelectorAll('img').forEach((img) => {
          const src = img.currentSrc || img.src;
          if (!src || src.startsWith('data:') || /\.svg(\?|$)/i.test(src)) return;
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          if (w && h && (w < 300 || h < 200)) return; // skip icons/thumbnails
          imgs.push({ src, alt: img.alt || '', w, h, og: false });
        });
        return { content: pickText().replace(/\s+/g, ' ').trim().slice(0, 12000), images: imgs };
      });
      out.push({ url, content, images });
      console.log(`  📥 scraped ${url} (${content.length} chars, ${images.length} imgs)`);
    } catch (e) {
      console.log(`  ✗ scrape failed ${url}: ${e.message.slice(0, 60)}`);
    }
  }
  await browser.close();
  return out;
}

// ── Consolidate + validate scraped sources (GPT-4o) ────────────────────────────
async function consolidateSources(job, scraped) {
  const usable = scraped.filter((s) => s.content && s.content.length > 200);
  if (!usable.length) return null;
  const text = usable.map((s, i) => `### Source ${i + 1}: ${s.url}\n${s.content.slice(0, 8000)}`).join('\n\n---\n\n');
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: CONSOLIDATE_PROMPT },
        { role: 'user', content: `Topic: ${job.title}\n\nScraped sources:\n\n${text}` },
      ],
      max_tokens: 2500,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });
    const c = JSON.parse(resp.choices[0].message.content);
    if (!c || (!c.summary && !(c.entries || []).length)) return null; // gibberish / unusable
    return c;
  } catch (e) {
    console.log(`  ⚠ consolidation failed: ${e.message.slice(0, 60)}`);
    return null;
  }
}

// ── Prompt assembly ──────────────────────────────────────────────────────────
function loadStructure(type) {
  const path = join(__dirname, 'toplist-structures', `${type}.md`);
  if (!existsSync(path)) throw new Error(`No structure file for type "${type}" (expected ${path})`);
  return readFileSync(path, 'utf-8');
}

function buildUserPrompt({ job, context, images, candidates, catalog, reviews }) {
  let p = `# Toplist to write\n\n- Title: ${job.title}\n- Type: ${job.type}\n- Current year: ${CURRENT_YEAR} (write for this year; update any older years from sources)\n- Max ranked entries: ${job.maxEntries ?? 10}\n`;

  if (context) {
    p += `\n## Consolidated research context (validated from external sources — paraphrase, do NOT copy)\n`;
    if (context.summary) p += `\nSummary: ${context.summary}\n`;
    if ((context.entries || []).length) { p += `\nMentioned entities:\n`; for (const e of context.entries) p += `- ${e.name}: ${e.note}\n`; }
    if ((context.quotes || []).length) { p += `\nQuotes you may attribute (verbatim, with source):\n`; for (const q of context.quotes) p += `- "${q.text}" — ${q.source}\n`; }
  } else {
    p += `\n## (No usable external context — rely on our data below.)\n`;
  }

  if (images?.length) {
    p += `\n## Available images (use ONLY these exact src URLs for <img>)\n`;
    for (const im of images) p += `- ${im.src}${im.alt ? `  (alt: ${truncate(im.alt, 80)})` : ''}\n`;
  }

  if (candidates.length) {
    p += `\n## Candidate sites (our catalog — ranked entries should come from here)\n`;
    p += `Each: id | name | slug | bestPrice | shortDescription, then highlights and quotable reviewer opinions (attribute quotes to the listed source).\n`;
    for (const c of candidates) {
      p += `- ${c.id} | ${c.name} | ${c.slug} | ${c.bestPrice ?? '—'} | ${truncate(c.shortDescription, 160) ?? ''}\n`;
      if (c.highlights) p += `    highlights: ${truncate(c.highlights, 400)}\n`;
      for (const q of c.opinionQuotes || []) p += `    quote: "${truncate(q.text, 200)}" — ${q.source}\n`;
    }
  }

  if (reviews.length) {
    p += `\n## Our reviews (for the sites above)\n`;
    for (const r of reviews) p += `- ${r.slug}: score ${r.overallScore ?? '—'}/10 — ${truncate(r.description, 200) ?? ''}\n`;
  }

  p += `\n## Our full site catalog (id | name | slug)\n`;
  for (const s of catalog) p += `${s.id} | ${s.name} | ${s.slug}\n`;

  p += `\n# Structure instructions for type "${job.type}"\n\n${loadStructure(job.type)}`;
  return p;
}

// ── Widget + image sanitization ────────────────────────────────────────────────
function sanitizeWidgets(html, validIds) {
  let removed = 0;
  html = html.replace(/<div\b[^>]*\bdata-component="site-card"[^>]*>[\s\S]*?<\/div>/g, (block) => {
    const m = block.match(/data-site-id="(\d+)"/);
    if (m && validIds.has(Number(m[1]))) return block;
    removed++; return '';
  });
  html = html.replace(/(<div\b[^>]*\bdata-component="site-card-list"[^>]*\bdata-site-ids=")([^"]*)("[\s\S]*?<\/div>)/g, (block, pre, ids, post) => {
    const list = ids.split(',').map((s) => s.trim()).filter(Boolean);
    const kept = list.filter((id) => validIds.has(Number(id)));
    if (kept.length === 0) { removed++; return ''; }
    if (kept.length !== list.length) removed++;
    return `${pre}${kept.join(',')}${post}`;
  });
  return { html, removed };
}

/** Re-host inline <img> tags whose src is in the allowed set; drop the rest. */
async function rehostInlineImages(html, allowed, slug) {
  const matches = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g)];
  let kept = 0, dropped = 0, n = 0;
  for (const m of matches) {
    const [tag, src] = m;
    if (!allowed.has(src)) { html = html.replace(tag, ''); dropped++; continue; }
    const up = await uploadImageFromUrl(src, `${slug}-img-${++n}${extFromUrl(src)}`);
    if (!up) { html = html.replace(tag, ''); dropped++; continue; }
    html = html.replace(tag, tag.replace(/\bsrc="[^"]+"/, `src="${STRAPI_URL}${up.url}"`));
    kept++;
  }
  return { html, kept, dropped };
}

function pickCover(images) {
  if (!images.length) return null;
  return images.find((i) => i.og) || [...images].sort((a, b) => (b.w * b.h) - (a.w * a.h))[0];
}

// ── Generation + create ────────────────────────────────────────────────────────
async function generateToplist(userPrompt) {
  const response = await openai.chat.completions.create({
    model: 'gpt-5.5',
    messages: [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n${ELEMENTS_PROMPT}` },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: 8000,
    response_format: { type: 'json_object' },
  });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('No response from GPT-5.5');
  return JSON.parse(raw);
}

async function createArticle(data) {
  const res = await fetch(`${STRAPI_URL}/api/articles`, { method: 'POST', headers, body: JSON.stringify({ data }) });
  if (!res.ok) throw new Error(`Create article failed: ${res.status} ${await res.text()}`);
  return res.json();
}
async function publishArticle(documentId) {
  const res = await fetch(`${STRAPI_URL}/api/articles/${documentId}`, { method: 'PUT', headers, body: JSON.stringify({ data: { publishedAt: new Date().toISOString() } }) });
  if (!res.ok) throw new Error(`Publish failed: ${res.status} ${await res.text()}`);
}
async function deleteArticle(documentId) {
  const res = await fetch(`${STRAPI_URL}/api/articles/${documentId}`, { method: 'DELETE', headers });
  if (!res.ok && res.status !== 204) throw new Error(`Delete failed: ${res.status} ${await res.text()}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(jobsPath)) {
    console.error(`Error: jobs config not found at ${jobsPath}. Copy toplist-jobs.example.json to toplist-jobs.json or pass --jobs <path>.`);
    process.exit(1);
  }
  const allJobs = JSON.parse(readFileSync(jobsPath, 'utf-8'));
  const jobs = allMode ? allJobs : allJobs.filter((j) => jobIds.includes(j.id));
  if (jobs.length === 0) { console.error('No matching jobs.'); process.exit(1); }

  let author = null;
  if (!dryRun) {
    author = await fetchAuthor(authorSlug);
    if (!author) { console.error(`Author "${authorSlug}" not found.`); process.exit(1); }
  }

  console.log('Loading site catalog...');
  const catalog = await fetchCatalog();
  const validIds = new Set(catalog.map((s) => s.id));
  console.log(`Catalog: ${catalog.length} active sites. Current year: ${CURRENT_YEAR}.\n`);

  let created = 0, skipped = 0, failed = 0;

  for (const job of jobs) {
    const slug = job.slug || slugify(job.title);
    console.log(`\n🗒️  ${job.title}  [${job.type}] → /blog/${slug}`);
    try {
      if (!dryRun) {
        const existing = await articleExists(slug);
        if (existing && !forceMode) {
          console.log('  ⏭  article with this slug exists — skipping (use --force).'); skipped++; continue;
        }
        if (existing && forceMode) {
          await deleteArticle(existing.documentId);
          console.log('  🗑  deleted existing article (force)');
        }
      }

      // Candidates
      let candidates = [];
      if (job.referenceSite) {
        const ref = await fetchSiteBySlug(job.referenceSite);
        if (ref) candidates = await fetchSimilarSites(ref);
        else console.log(`  ⚠ referenceSite "${job.referenceSite}" not found.`);
      } else if (job.category) {
        candidates = await fetchSitesByCategory(job.category);
      }
      console.log(`  candidates: ${candidates.length}`);

      // Reviews (optional): reference site + the ranked candidates
      let reviews = [];
      if (job.includeReviews) {
        const slugs = [];
        if (job.referenceSite) slugs.push(job.referenceSite);
        slugs.push(...candidates.slice(0, job.maxEntries ?? 10).map((c) => c.slug));
        const uniq = [...new Set(slugs)];
        reviews = (await Promise.all(uniq.map((s) => fetchReviewForSite(s)))).filter(Boolean);
        console.log(`  reviews: ${reviews.length}`);
      }

      // Scrape → consolidate → validate
      const scraped = await scrapeSources(job.sources);
      const context = await consolidateSources(job, scraped);
      if (scraped.length) console.log(`  context: ${context ? 'consolidated ✓' : 'none usable'}${context?.discarded?.length ? ` (discarded ${context.discarded.length})` : ''}`);

      // Images (dedup by src), cap the list shown to GPT
      const seen = new Set();
      const allImages = scraped.flatMap((s) => s.images || []).filter((im) => (seen.has(im.src) ? false : (seen.add(im.src), true)));
      const promptImages = allImages.slice(0, 12);

      // Generate
      const userPrompt = buildUserPrompt({ job, context, images: promptImages, candidates, catalog, reviews });
      console.log('  🤖 generating with GPT-5.5...');
      const gen = await generateToplist(userPrompt);
      if (!gen.title || !gen.content) throw new Error('GPT response missing title/content');

      let { html, removed } = sanitizeWidgets(gen.content, validIds);
      if (removed > 0) console.log(`  🧹 sanitized ${removed} widget(s) with unknown site IDs`);

      const faqs = Array.isArray(gen.faqs) ? gen.faqs.filter((f) => f?.question && f?.answer).map((f) => ({ question: f.question, answer: f.answer })) : [];
      const cover = pickCover(allImages);

      if (dryRun) {
        console.log('  · dry-run output:');
        console.log(JSON.stringify({ metaTitle: gen.metaTitle, title: gen.title, slug, description: gen.description, faqs: faqs.length, coverCandidate: cover?.src ?? null, inlineImgs: (html.match(/<img\b/g) || []).length, contentPreview: html.slice(0, 400) }, null, 2));
        continue;
      }

      // Re-host inline images (allowed = scraped set), then cover
      const allowed = new Set(allImages.map((i) => i.src));
      const reh = await rehostInlineImages(html, allowed, slug);
      html = reh.html;
      if (reh.kept || reh.dropped) console.log(`  🖼️  inline images: ${reh.kept} kept, ${reh.dropped} dropped`);

      let coverId = null;
      if (cover) {
        const up = await uploadImageFromUrl(cover.src, `${slug}-cover${extFromUrl(cover.src)}`);
        if (up) { coverId = up.id; console.log('  🖼️  cover uploaded'); }
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
      console.log(`  💾 ${publishMode ? 'published' : 'saved draft'}: ${slug} (${faqs.length} FAQs)`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${e.message}`);
    }
    await sleep(3000);
  }

  console.log('\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Jobs: ${jobs.length} | Created: ${created} | Skipped: ${skipped} | Failed: ${failed}`);
}

main().catch((e) => { console.error('Fatal error:', e); process.exit(1); });
