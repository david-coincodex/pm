#!/usr/bin/env node
/**
 * generate-ad-articles.mjs
 *
 * Builds the "Best <N> <Site> Ads in <Year>" articles from `commercial` records.
 *
 * Deliberately a separate script rather than another `toplist-structures/*.md` type:
 * generate-toplists.mjs is built around ranking OUR CATALOG (fetchSimilarSites,
 * insertSiteImages matching <h2>s to catalog sites), while these articles rank ADS WITHIN
 * ONE SITE. `loadStructure()` only swaps the prompt; this needs different code.
 *
 * The model writes prose only and never sees a numeric id: it places opaque {{AD_n}} markers
 * (the pattern proven in generate-cancel-guides.mjs) which we swap for widget markup built
 * from the records. That removes the whole class of bug that `sanitizeWidgets()` exists to
 * clean up in generate-toplists.mjs — a hallucinated id can't reach the draft because the
 * model never writes one.
 *
 * Usage:
 *   node scripts/generate-ad-articles.mjs [--all | jobId ...] --author <slug> [options]
 *
 * Options:
 *   --all            Process every job in the config
 *   --force          Replace an existing article with the same slug (default: skip)
 *   --dry-run        Print the generated article; no OpenAI spend guard, no Strapi writes
 *   --jobs <path>    Jobs config (default: scripts/ad-jobs.json)
 *   --author <slug>  Author slug (required unless --dry-run)
 *
 * Environment (scripts/.env): STRAPI_URL, STRAPI_TOKEN, OPENAI_API_KEY
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
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

const flagValue = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const has = (name) => process.argv.includes(`--${name}`);

const DRY_RUN = has('dry-run');
const FORCE = has('force');
const JOBS_PATH = flagValue('jobs') ?? join(__dirname, 'ad-jobs.json');
const AUTHOR_SLUG = flagValue('author');

if (!OPENAI_API_KEY) { console.error('Error: OPENAI_API_KEY is required.'); process.exit(1); }
if (!DRY_RUN && !TOKEN) { console.error('Error: STRAPI_TOKEN is required.'); process.exit(1); }
if (!DRY_RUN && !AUTHOR_SLUG) { console.error('Error: --author <slug> is required.'); process.exit(1); }

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const SYSTEM_PROMPT = readFileSync(join(__dirname, 'ad-article-prompt.md'), 'utf8');

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Strapi reads ────────────────────────────────────────────────────────────────

/**
 * The paysite the article is about, with the context the model needs to write about it
 * specifically: what it is, what a subscription includes, and whether a discount exists.
 * Same shape of data the other generators pass (name | slug | shortDescription + highlights).
 */
async function getSite(slug) {
  const res = await fetch(
    `${STRAPI_URL}/api/sites?filters[slug][$eq]=${encodeURIComponent(slug)}` +
      `&fields[0]=name&fields[1]=slug&fields[2]=short_description&fields[3]=included` +
      `&fields[4]=siteType&fields[5]=url` +
      `&populate[offers][fields][0]=price&populate[offers][fields][1]=full_price` +
      `&populate[offers][fields][2]=offerType&populate[offers][fields][3]=isActive` +
      `&populate[platform][fields][0]=name`,
    { headers },
  );
  if (!res.ok) throw new Error(`site ${slug}: ${res.status}`);
  const site = (await res.json()).data?.[0];
  if (!site) throw new Error(`site not found: ${slug}`);
  return site;
}

/** Our own review of the site, if we have one — score + summary, as the toplists do. */
async function getReview(siteSlug) {
  const res = await fetch(
    `${STRAPI_URL}/api/reviews?filters[site][slug][$eq]=${encodeURIComponent(siteSlug)}` +
      `&fields[0]=overallScore&fields[1]=description&pagination[pageSize]=1`,
    { headers },
  );
  if (!res.ok) return null;
  return (await res.json()).data?.[0] ?? null;
}

/**
 * Describe the site's live discount WITHOUT handing the model exact figures to hardcode:
 * body copy is static while the offer widget renders live numbers, so a price written into
 * prose goes stale and contradicts the page. The model gets the shape of the deal only.
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

async function getCommercials(siteSlug, limit) {
  const res = await fetch(
    `${STRAPI_URL}/api/commercials?filters[site][slug][$eq]=${encodeURIComponent(siteSlug)}` +
      `&fields[0]=title&fields[1]=slug&fields[2]=description&fields[3]=sceneTitle` +
      `&fields[4]=performers&fields[5]=durationSeconds&fields[6]=popularity` +
      `&populate[poster][fields][0]=url` +
      `&sort=popularity:desc&pagination[pageSize]=${limit}`,
    { headers },
  );
  if (!res.ok) throw new Error(`commercials ${siteSlug}: ${res.status}`);
  return (await res.json()).data ?? [];
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

async function findArticleBySlug(slug) {
  const res = await fetch(
    `${STRAPI_URL}/api/articles?filters[slug][$eq]=${encodeURIComponent(slug)}&fields[0]=slug&status=draft`,
    { headers },
  );
  if (!res.ok) return null;
  return (await res.json()).data?.[0] ?? null;
}

// ── Generation ──────────────────────────────────────────────────────────────────

async function generate(job, site, commercials, review) {
  const adContext = commercials
    .map((c, i) => {
      const parts = [
        `AD_${i + 1}:`,
        `  title: ${c.title}`,
        c.sceneTitle ? `  scene: ${c.sceneTitle}` : null,
        c.performers ? `  performers: ${c.performers}` : null,
        c.durationSeconds ? `  clip length: ${c.durationSeconds}s` : null,
        `  description (already rendered by the widget — do NOT repeat it): ${c.description}`,
      ].filter(Boolean);
      return parts.join('\n');
    })
    .join('\n\n');

  const user = [
    '## The paysite this article is about',
    '',
    `- name: ${site.name}`,
    `- slug: ${site.slug}`,
    `- type: ${site.siteType ?? 'paysite'}`,
    site.platform?.name ? `- network/platform: ${site.platform.name}` : null,
    site.short_description ? `- what it is: ${site.short_description}` : null,
    site.included ? `- a subscription includes: ${String(site.included).replace(/\s*\n\s*/g, ' | ')}` : null,
    review
      ? `- our review: ${review.overallScore ?? '—'}/10 — ${review.description ?? ''}`
      : '- our review: none on file',
    `- our offer: ${describeOffer(site)}`,
    '',
    'Every ad below is one of THIS site\'s own commercials. The article is about this site',
    'only — no comparisons with other paysites, no alternatives.',
    '',
    '## Article',
    '',
    `- Title (use verbatim): ${job.title}`,
    `- Year: ${job.year ?? new Date().getUTCFullYear()}`,
    `- Number of ads: ${commercials.length}`,
    '',
    `Place these markers, each exactly once, in ascending order: ${commercials
      .map((_, i) => `{{AD_${i + 1}}}`)
      .join(' ')}`,
    '',
    'Ads:',
    adContext,
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
 * Every marker must be present exactly once. Fail loudly rather than shipping an article
 * that silently drops an ad — a missing marker means a clip nobody can find.
 */
function assertMarkers(html, count) {
  const problems = [];
  for (let i = 1; i <= count; i++) {
    const n = (html.match(new RegExp(`\\{\\{AD_${i}\\}\\}`, 'g')) ?? []).length;
    if (n !== 1) problems.push(`{{AD_${i}}} appears ${n} times (expected 1)`);
  }
  const stray = [...html.matchAll(/\{\{AD_(\d+)\}\}/g)].map((m) => Number(m[1])).filter((n) => n > count);
  if (stray.length) problems.push(`markers beyond the ad count: ${[...new Set(stray)].join(', ')}`);
  if (problems.length) throw new Error(`marker check failed:\n    ${problems.join('\n    ')}`);
}

/**
 * Swap markers for widget markup.
 *
 * `data-component` first, id immediately after, exactly one space: the frontend prefetch
 * regexes are attribute-order sensitive and fail SILENTLY to an empty node.
 *
 * split/join, not replace(): a `$` in replacement text is a special pattern in
 * String.replace and would corrupt the output.
 */
function placeAdWidgets(html, commercials) {
  let out = html;
  commercials.forEach((c, i) => {
    const widget =
      // documentId, not numeric id — republishing reassigns numeric ids and would orphan
      // the widget (measured: 18 commercials moved 6–40 -> 41–58 after one edit each).
      `<div data-component="commercial" data-commercial-id="${c.documentId}" class="pm-widget pm-widget--commercial" contenteditable="false">` +
      `<span class="pm-widget__label">Ad ${i + 1}: ${escapeHtml(c.title)}</span></div>`;
    out = out.split(`{{AD_${i + 1}}}`).join(widget);
  });
  return out.replace(/\{\{AD_\d+\}\}/g, '');
}

/** Offer at the very top + the derived index below the intro. */
function addFixedWidgets(html, siteNumericId) {
  const offer =
    `<div data-component="site-card" data-site-id="${siteNumericId}" class="pm-widget" contenteditable="false">` +
    `<span class="pm-widget__label">Site Card</span></div>`;
  const index =
    `<div data-component="commercial-index" class="pm-widget" contenteditable="false">` +
    `<span class="pm-widget__label">Ad Index (auto — lists every ad below, in order)</span></div>`;

  let out = html.includes('{{INDEX}}') ? html.split('{{INDEX}}').join(index) : html;
  // If the model didn't leave a slot, place the index directly after the intro — i.e. before
  // whichever comes first: the first <h2> or the first ad widget. Anchoring on the <h2>
  // alone would break now that there is no heading before the ads: the first remaining
  // <h2> is "How we picked these", which sits *after* every ad, so the index would land at
  // the bottom of the page.
  if (!out.includes('data-component="commercial-index"')) {
    const positions = [out.indexOf('<h2'), out.indexOf('<div data-component="commercial"')]
      .filter((i) => i !== -1);
    const at = positions.length ? Math.min(...positions) : -1;
    out = at === -1 ? out + index : out.slice(0, at) + index + out.slice(at);
  }
  out = out.split('{{OFFER}}').join('');
  return offer + out;
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function run(job) {
  const site = await getSite(job.site);
  const commercials = await getCommercials(job.site, job.maxAds ?? 20);
  if (!commercials.length) throw new Error(`no commercials for site ${job.site} — run import-commercials first`);
  console.log(`  site: ${site.name} | ads: ${commercials.length}`);

  if (!job.postId) {
    console.warn('  ⚠ job has no postId — the article will fall back to its Strapi id in the URL');
  }

  const existing = await findArticleBySlug(job.slug);
  if (existing && !FORCE && !DRY_RUN) {
    console.log(`  article "${job.slug}" exists — skipping (use --force to replace)`);
    return 0;
  }

  const review = await getReview(job.site);
  const { data: gen, usage } = await generate(job, site, commercials, review);
  console.log(`  generated (${usage?.total_tokens ?? '?'} tokens)`);

  assertMarkers(gen.contentHtml ?? '', commercials.length);

  let html = placeAdWidgets(gen.contentHtml, commercials);
  html = addFixedWidgets(html, site.id);

  const faqs = (gen.faqs ?? [])
    .filter((f) => f?.question && f?.answer)
    .map((f) => ({ question: String(f.question), answer: String(f.answer) }));

  const payload = {
    metaTitle: gen.metaTitle || job.title,
    title: job.title,          // never model-generated: the H1 is pinned by the job
    slug: job.slug,            // pinned: slugify(title) would break the legacy URL
    postId: job.postId,        // pinned: the production pornmode.com id
    description: gen.description || job.title,
    content: html,
    faqs,
    publishDate: new Date().toISOString(),
  };

  // Without this the article template renders a large empty placeholder where the cover
  // should be. The top-ranked ad's poster is the most representative image we have.
  const coverId = commercials.find((c) => c.poster?.id)?.poster?.id ?? null;
  if (coverId) payload.coverImage = coverId;

  if (DRY_RUN) {
    console.log(`\n  metaTitle: ${payload.metaTitle}`);
    console.log(`  description: ${payload.description}`);
    console.log(`  slug/postId: ${payload.slug} / ${payload.postId}`);
    console.log(`  faqs: ${faqs.length}`);
    console.log(`  widgets: site-card=${(html.match(/data-component="site-card"/g) ?? []).length}` +
      ` index=${(html.match(/data-component="commercial-index"/g) ?? []).length}` +
      ` ads=${(html.match(/data-component="commercial"/g) ?? []).length}`);
    console.log(`  content bytes: ${html.length}`);
    console.log(`\n${html.slice(0, 1200)}…`);
    return 0;
  }

  payload.author = (await resolveRelationIds('authors', [AUTHOR_SLUG]))[0];
  if (!payload.author) throw new Error(`author not found: ${AUTHOR_SLUG}`);
  const cats = await resolveRelationIds('categories', job.categories ?? (job.category ? [job.category] : []));
  const tags = await resolveRelationIds('tags', job.tags);
  if (cats.length) payload.categories = cats;
  if (tags.length) payload.tags = tags;

  if (existing && FORCE) {
    // In-place PUT, NOT delete+create: recreating reassigns Strapi's id and documentId, and
    // churns the canonical URL of an already-indexed page.
    const res = await fetch(`${STRAPI_URL}/api/articles/${existing.documentId}`, {
      method: 'PUT', headers, body: JSON.stringify({ data: payload }),
    });
    if (!res.ok) throw new Error(`PUT ${res.status} ${(await res.text()).slice(0, 240)}`);
    const saved = (await res.json()).data;
    console.log(`  updated in place: id=${saved.id} postId=${saved.postId} /blog/${saved.postId}/${saved.slug}/`);
  } else {
    const res = await fetch(`${STRAPI_URL}/api/articles`, {
      method: 'POST', headers, body: JSON.stringify({ data: payload }),
    });
    if (!res.ok) throw new Error(`POST ${res.status} ${(await res.text()).slice(0, 240)}`);
    const saved = (await res.json()).data;
    console.log(`  created: id=${saved.id} postId=${saved.postId} /blog/${saved.postId}/${saved.slug}/`);
  }
  return 0;
}

const jobs = JSON.parse(readFileSync(JOBS_PATH, 'utf8'));
const requested = process.argv.slice(2).filter((a, i, arr) => {
  if (a.startsWith('--')) return false;
  // skip values that belong to a preceding flag
  return !(i > 0 && ['--jobs', '--author'].includes(arr[i - 1]));
});
const selected = has('all') ? jobs : jobs.filter((j) => requested.includes(j.id));

if (!selected.length) {
  console.error(`No jobs selected. Use --all or a job id.\nAvailable: ${jobs.map((j) => j.id).join(', ')}`);
  process.exit(1);
}

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
