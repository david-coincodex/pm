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

// USD per 1M tokens. Override via env (OPENAI_PRICE_GPT55_IN, ..._OUT, ..._GPT4O_IN, ..._OUT).
// ⚠ Token counts logged below are exact (from the API); the $ estimate is only as right as these rates — verify at https://openai.com/api/pricing/
const PRICE = {
  'gpt-5.5': { in: Number(process.env.OPENAI_PRICE_GPT55_IN ?? 1.25), out: Number(process.env.OPENAI_PRICE_GPT55_OUT ?? 10) },
  'gpt-4o': { in: Number(process.env.OPENAI_PRICE_GPT4O_IN ?? 2.5), out: Number(process.env.OPENAI_PRICE_GPT4O_OUT ?? 10) },
};
const costOf = (model, usage) => {
  const p = PRICE[model];
  if (!p || !usage) return 0;
  return ((usage.prompt_tokens || 0) * p.in + (usage.completion_tokens || 0) * p.out) / 1e6;
};

const SYSTEM_PROMPT = readFileSync(join(__dirname, 'toplist-prompt.md'), 'utf-8');
const ELEMENTS_PROMPT = readFileSync(join(__dirname, 'toplist-elements.md'), 'utf-8');
const CONSOLIDATE_PROMPT = readFileSync(join(__dirname, 'toplist-consolidate-prompt.md'), 'utf-8');

// Cached AVN headline-award data (built by build-avn-awards.mjs); local lookup, no API cost.
let AVN_AWARDS = null;
function avnAwardsFor(name) {
  if (AVN_AWARDS === null) {
    try { AVN_AWARDS = JSON.parse(readFileSync(join(__dirname, 'data', 'avn-awards.json'), 'utf-8')); }
    catch { AVN_AWARDS = {}; }
  }
  return AVN_AWARDS[(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')]?.awards ?? null;
}

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

const SITE_FIELDS = 'fields[0]=name&fields[1]=slug&fields[2]=short_description&fields[3]=externalContext&populate[offers][fields][0]=price&populate[offers][fields][1]=isActive&populate[categories][fields][0]=slug&populate[cover_image][fields][0]=url&populate[logo][fields][0]=url&populate[parent_site][fields][0]=slug';

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
    coverUrl: s.cover_image?.url ?? s.logo?.url ?? null, // fallback image (already on our media)
    isSub: !!s.parent_site, // true = sub-site/child channel
  };
}

async function fetchSiteBySlug(slug) {
  const { data } = await strapiFetch(`/sites?${SITE_FIELDS}&filters[slug][$eq]=${encodeURIComponent(slug)}&filters[isActive][$eq]=true&pagination[pageSize]=1`);
  return data[0] ?? null;
}
// Fetch sites matching `extra` filters (active, name-sorted, capped).
async function fetchSitesWhere(extra) {
  const { data } = await strapiFetch(`/sites?${SITE_FIELDS}&filters[isActive][$eq]=true&${extra}&sort=name:asc&pagination[pageSize]=40`);
  return data;
}

/**
 * Prefer main sites (no parent). Only if there aren't enough to make a good
 * list (fewer than `maxEntries`) do we append sub-sites — main always first.
 */
async function fetchSitesByCategory(categorySlug, maxEntries) {
  const f = `filters[categories][slug][$eq]=${encodeURIComponent(categorySlug)}`;
  const main = await fetchSitesWhere(`filters[parent_site][$null]=true&${f}`);
  let pool = main;
  if (main.length < maxEntries) pool = [...main, ...(await fetchSitesWhere(`filters[parent_site][$notNull]=true&${f}`))];
  return pool.slice(0, 40).map(toCandidate);
}
async function fetchSimilarSites(refSite, maxEntries) {
  const catSlugs = (refSite.categories ?? []).map((c) => c.slug).filter(Boolean);
  if (catSlugs.length === 0) return [];
  const f = catSlugs.map((s, i) => `filters[categories][slug][$in][${i}]=${encodeURIComponent(s)}`).join('&');
  const notRef = (s) => s.slug !== refSite.slug;
  const main = (await fetchSitesWhere(`filters[parent_site][$null]=true&${f}`)).filter(notRef);
  let pool = main;
  if (main.length < maxEntries) {
    // Supplement with sub-sites, but never the reference site's own children.
    const subs = (await fetchSitesWhere(`filters[parent_site][$notNull]=true&${f}`)).filter((s) => notRef(s) && s.parent_site?.slug !== refSite.slug);
    pool = [...main, ...subs];
  }
  return pool.slice(0, 40).map(toCandidate);
}
async function fetchReviewForSite(slug) {
  const { data } = await strapiFetch(`/reviews?filters[site][slug][$eq]=${encodeURIComponent(slug)}&filters[publishedAt][$notNull]=true&fields[0]=overallScore&fields[1]=description&pagination[pageSize]=1`);
  const r = data[0];
  return r ? { slug, overallScore: r.overallScore ?? null, description: r.description ?? null } : null;
}
/**
 * "Best <site> sites": the reference site's own network — its child sites — ranked
 * by our published review score (highest first). Used by the best-network-sites type.
 */
async function fetchNetworkSites(refSite, maxEntries) {
  const f = `filters[parent_site][slug][$eq]=${encodeURIComponent(refSite.slug)}`;
  const children = (await fetchSitesWhere(f)).map(toCandidate);
  if (children.length === 0) return [];
  const scored = await Promise.all(
    children.map(async (c) => ({ ...c, score: (await fetchReviewForSite(c.slug))?.overallScore ?? null }))
  );
  // Highest-rated first; unrated sink to the bottom but stay eligible.
  scored.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return scored.slice(0, maxEntries);
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
        if (og) imgs.push({ src: og, alt: 'cover', context: '', w: 1200, h: 630, og: true });
        const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4'));
        const precedingHeading = (node) => {
          let best = '';
          for (const h of heads) {
            if (h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) best = h.innerText;
            else break;
          }
          return best.slice(0, 120);
        };
        document.querySelectorAll('img').forEach((img) => {
          const src = img.currentSrc || img.src;
          if (!src || src.startsWith('data:') || /\.svg(\?|$)/i.test(src)) return;
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          if (w && h && (w < 300 || h < 200)) return; // skip icons/thumbnails
          imgs.push({ src, alt: img.alt || '', context: precedingHeading(img), w, h, og: false });
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
  if (!usable.length) return { context: null, usage: null };
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
    if (!c || (!c.summary && !(c.entries || []).length)) return { context: null, usage: resp.usage }; // gibberish / unusable
    return { context: c, usage: resp.usage };
  } catch (e) {
    console.log(`  ⚠ consolidation failed: ${e.message.slice(0, 60)}`);
    return { context: null, usage: null };
  }
}

// ── Prompt assembly ──────────────────────────────────────────────────────────
function loadStructure(type) {
  const path = join(__dirname, 'toplist-structures', `${type}.md`);
  if (!existsSync(path)) throw new Error(`No structure file for type "${type}" (expected ${path})`);
  return readFileSync(path, 'utf-8');
}

function buildUserPrompt({ job, context, candidates, catalog, reviews }) {
  let p = `# Toplist to write\n\n- Title: ${job.title}\n- Type: ${job.type}\n- Current year: ${CURRENT_YEAR} (write for this year; update any older years from sources)\n- Max ranked entries: ${job.maxEntries ?? 10}\n`;

  if (context) {
    p += `\n## Consolidated research context (validated from external sources — paraphrase, do NOT copy)\n`;
    if (context.summary) p += `\nSummary: ${context.summary}\n`;
    if ((context.entries || []).length) {
      p += `\nMentioned entities:\n`;
      for (const e of context.entries) {
        p += `- ${e.name}: ${e.note}\n`;
        if (e.awards?.length) p += `    AVN awards (verified — mention only these, with the year, never invent): ${e.awards.join('; ')}\n`;
      }
    }
    const quotes = (context.quotes || []).filter((q) => !normKey(q.source || '').includes('pornmode')); // never quote our own site
    if (quotes.length) { p += `\nQuotes you may attribute (verbatim, with source) — never quote pornmode (us):\n`; for (const q of quotes) p += `- "${q.text}" — ${q.source}\n`; }
  } else {
    p += `\n## (No usable external context — rely on our data below.)\n`;
  }

  if (candidates.length) {
    p += `\n## Candidate sites (our catalog — ranked entries should come from here)\n`;
    p += `Each: id | name | slug | shortDescription, then highlights and quotable reviewer opinions (attribute quotes to the listed source).\n`;
    for (const c of candidates) {
      p += `- ${c.id} | ${c.name} | ${c.slug} | ${truncate(c.shortDescription, 160) ?? ''}\n`;
      if (c.highlights) p += `    highlights: ${truncate(c.highlights, 400)}\n`;
      for (const q of (c.opinionQuotes || []).filter((q) => !normKey(q.source || '').includes('pornmode'))) p += `    quote: "${truncate(q.text, 200)}" — ${q.source}\n`;
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

const normKey = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Identify a site from an H2 heading: exact name match first, then unambiguous includes. */
function matchSite(text, catalog) {
  const b = normKey(text);
  if (b.length < 3) return null;
  const exact = catalog.find((c) => normKey(c.name) === b);
  if (exact) return exact;
  const incl = catalog.filter((c) => { const a = normKey(c.name); return a.length > 3 && (b.includes(a) || a.includes(b)); });
  if (!incl.length) return null;
  // prefer the candidate whose normalized name is closest in length to the heading
  incl.sort((x, y) => Math.abs(normKey(x.name).length - b.length) - Math.abs(normKey(y.name).length - b.length));
  return incl[0];
}

/** Best-size source image matched to an entry by name/slug via alt/nearby-heading/filename. */
function bestSourceImage(name, slug, images, used) {
  const n = normKey(name);
  const s = normKey(slug);
  const hit = images.filter((im) => {
    if (im.og || used.has(im.src)) return false;
    const hay = normKey(`${im.alt} ${im.context} ${im.src}`);
    return (n.length > 2 && hay.includes(n)) || (s.length > 3 && hay.includes(s));
  });
  return hit.sort((a, b) => (b.w * b.h) - (a.w * a.h))[0] || null;
}

/** Resolve a site's own cover/logo media URL (cached); used as image fallback. */
async function fetchSiteCoverUrl(slug, cache) {
  if (cache.has(slug)) return cache.get(slug);
  let url = null;
  try {
    const { data } = await strapiFetch(`/sites?filters[slug][$eq]=${encodeURIComponent(slug)}&populate[cover_image][fields][0]=url&populate[logo][fields][0]=url&pagination[pageSize]=1`);
    url = data[0]?.cover_image?.url ?? data[0]?.logo?.url ?? null;
  } catch { /* ignore */ }
  cache.set(slug, url);
  return url;
}

/**
 * Insert one image above each ranked entry's <h2>. For each entry (a numbered
 * heading or one matching a catalog site) it picks the best matching source
 * image (by entry/site name) and re-hosts it; for catalog sites with no source
 * match it falls back to the site's own cover_image. Works for both site lists
 * and topical lists (e.g. pornstars). Returns per-entry provenance.
 */
async function insertSiteImages(html, catalog, candidates, images, slug, isDry) {
  const report = []; // { entry, source: 'scraped'|'site-cover'|'none' }
  const used = new Set();
  const coverCache = new Map(candidates.map((c) => [c.slug, c.coverUrl ?? null]));
  // Only match headings to our catalog (and use a site's cover as fallback) for
  // site-oriented jobs. On topical lists (e.g. pornstars) there are no candidates,
  // so we never mis-match a performer to a site or insert a wrong site cover.
  const allowSiteMatch = candidates.length > 0;
  const h2Re = /<h2[^>]*>([\s\S]*?)<\/h2>/g;
  const tasks = [];
  let m;
  while ((m = h2Re.exec(html))) {
    const heading = m[0];
    const inner = m[1].replace(/<[^>]+>/g, ' ').trim();
    const ranked = /^\s*\d+[.)]/.test(inner);
    const name = inner.replace(/^\s*\d+[.)]\s*/, '').split(/[—\-:|]/)[0].trim();
    const site = allowSiteMatch ? matchSite(name, catalog) : null;
    if (!name || (!ranked && !site)) continue; // skip Verdict/Conclusion/FAQ etc.
    if (tasks.some((t) => normKey(t.name) === normKey(name))) continue;
    tasks.push({ heading, name, site });
  }

  for (const t of tasks) {
    let imgUrl = null, source = 'none';
    const match = bestSourceImage(t.site ? t.site.name : t.name, t.site ? t.site.slug : '', images, used);
    if (match) {
      if (isDry) { used.add(match.src); imgUrl = match.src; source = 'scraped'; }
      else {
        const up = await uploadImageFromUrl(match.src, `${slug}-${normKey(t.name)}${extFromUrl(match.src)}`);
        if (up) { used.add(match.src); imgUrl = `${STRAPI_URL}${up.url}`; source = 'scraped'; }
      }
    }
    if (!imgUrl && t.site) {
      const coverUrl = await fetchSiteCoverUrl(t.site.slug, coverCache);
      if (coverUrl) { imgUrl = `${STRAPI_URL}${coverUrl}`; source = 'site-cover'; }
    }
    report.push({ entry: t.name, source });
    // function replacement → `$` in a URL/name can't be interpreted as a replacement pattern
    if (imgUrl) html = html.replace(t.heading, () => `<img src="${imgUrl}" alt="${t.name}" />\n${t.heading}`);
  }
  return { html, report };
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
  return { data: JSON.parse(raw), usage: response.usage };
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

  let created = 0, skipped = 0, failed = 0, totalCost = 0;

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

      // Candidates (main sites preferred; sub-sites added only if too few)
      const maxEntries = job.maxEntries ?? 10;
      let candidates = [];
      if (job.referenceSite) {
        const ref = await fetchSiteBySlug(job.referenceSite);
        if (ref) {
          candidates = job.type === 'best-network-sites'
            ? await fetchNetworkSites(ref, maxEntries)   // the ref site's own network channels, top-rated first
            : await fetchSimilarSites(ref, maxEntries);  // sites sharing its categories
        } else console.log(`  ⚠ referenceSite "${job.referenceSite}" not found.`);
      } else if (job.category) {
        candidates = await fetchSitesByCategory(job.category, maxEntries);
      }
      const mainN = candidates.filter((c) => !c.isSub).length;
      console.log(`  candidates: ${candidates.length} (${mainN} main, ${candidates.length - mainN} sub)`);

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
      const { context, usage: cUsage } = await consolidateSources(job, scraped);
      if (scraped.length) console.log(`  context: ${context ? 'consolidated ✓' : 'none usable'}${context?.discarded?.length ? ` (discarded ${context.discarded.length})` : ''}`);

      // Attach verified AVN awards to any mentioned performer (local lookup, no API cost)
      if (context?.entries?.length) {
        let awarded = 0;
        for (const e of context.entries) { const a = avnAwardsFor(e.name); if (a) { e.awards = a; awarded++; } }
        if (awarded) console.log(`  🏆 AVN awards attached to ${awarded} performer(s)`);
      }

      // Images (dedup by src)
      const seen = new Set();
      const allImages = scraped.flatMap((s) => s.images || []).filter((im) => (seen.has(im.src) ? false : (seen.add(im.src), true)));

      // Generate (GPT writes clean content; images are added by us, not GPT)
      const userPrompt = buildUserPrompt({ job, context, candidates, catalog, reviews });
      console.log('  🤖 generating with GPT-5.5...');
      const { data: gen, usage: gUsage } = await generateToplist(userPrompt);
      if (!gen.title || !gen.content) throw new Error('GPT response missing title/content');

      // Cost (exact tokens from the API; $ uses configurable PRICE rates)
      const artCost = costOf('gpt-4o', cUsage) + costOf('gpt-5.5', gUsage);
      totalCost += artCost;
      const tok = (u) => (u ? `${u.prompt_tokens}→${u.completion_tokens}` : 'n/a');
      console.log(`  💵 tokens consolidate(gpt-4o) ${tok(cUsage)} · generate(gpt-5.5) ${tok(gUsage)} | est. $${artCost.toFixed(4)}`);

      let { html, removed } = sanitizeWidgets(gen.content, validIds);
      if (removed > 0) console.log(`  🧹 sanitized ${removed} widget(s) with unknown site IDs`);

      // Insert one image above each ranked-site <h2>: source image (re-hosted) or our cover fallback
      const imgRes = await insertSiteImages(html, catalog, candidates, allImages, slug, dryRun);
      html = imgRes.html;
      for (const r of imgRes.report) {
        const label = r.source === 'scraped' ? 'image from source (uploaded)' : r.source === 'site-cover' ? 'fallback to our site cover' : 'no image found';
        console.log(`  🖼️  ${r.entry}: ${label}`);
      }
      const imgCounts = imgRes.report.reduce((a, r) => ((a[r.source] = (a[r.source] || 0) + 1), a), {});

      const faqs = Array.isArray(gen.faqs) ? gen.faqs.filter((f) => f?.question && f?.answer).map((f) => ({ question: f.question, answer: f.answer })) : [];
      const cover = pickCover(allImages);

      if (dryRun) {
        console.log('  · dry-run output:');
        console.log(JSON.stringify({ metaTitle: gen.metaTitle, title: gen.title, slug, description: gen.description, faqs: faqs.length, coverCandidate: cover?.src ?? null, siteImages: imgCounts, contentPreview: html.slice(0, 400) }, null, 2));
        continue;
      }

      let coverId = null;
      if (cover) {
        const up = await uploadImageFromUrl(cover.src, `${slug}-cover${extFromUrl(cover.src)}`);
        if (up) { coverId = up.id; console.log('  🖼️  cover image uploaded'); }
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
      const fromSrc = imgCounts['scraped'] || 0, fromCover = imgCounts['site-cover'] || 0, noImg = imgCounts['none'] || 0;
      console.log(`  💾 ${publishMode ? 'published' : 'saved draft'}: ${slug}`);
      console.log(`     FAQs: ${faqs.length} | cover: ${coverId ? 'uploaded from source' : 'none'} | section images — from source: ${fromSrc}, from our cover: ${fromCover}, none: ${noImg}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${e.message}`);
    }
    await sleep(3000);
  }

  console.log('\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Jobs: ${jobs.length} | Created: ${created} | Skipped: ${skipped} | Failed: ${failed}`);
  console.log(`Estimated OpenAI cost: $${totalCost.toFixed(4)} (${jobs.length ? '$' + (totalCost / jobs.length).toFixed(4) + '/article avg' : ''})`);
}

main().catch((e) => { console.error('Fatal error:', e); process.exit(1); });
