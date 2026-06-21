#!/usr/bin/env node
/**
 * generate-faqs.mjs
 *
 * Generates FAQs with GPT-5.5 for sites that have a published review (the review is
 * the factual basis). Two flavours are produced and written to the localized `faqs`
 * component on each content-type:
 *   - REVIEW faqs  → content/experience focused  → review.faqs
 *   - SITE faqs    → deal/offer focused (durable) → site.faqs
 *
 * Volatile facts (exact price, discount %, payment methods, trial, downloads) are NOT
 * generated here — they're rendered dynamically at request time from live offers by
 * frontend/src/lib/dynamicFaqs.ts, so they never go stale. These AI FAQs cover the
 * durable, editorial questions only.
 *
 * Usage:
 *   node scripts/generate-faqs.mjs [--all | slug1 slug2 ...] [options]
 *
 * Options:
 *   --all            Process every site that has a published review
 *   --site-only      Only (re)generate + write site.faqs
 *   --review-only    Only (re)generate + write review.faqs
 *   --force          Overwrite existing FAQs (default: skip a target that already has FAQs)
 *   --publish        Publish the updated draft (see caveat below)
 *   --batch          Generate via the OpenAI Batch API (~50% cheaper, async): submits one
 *                    job for all sites, polls until done, then writes/publishes. Best for --all.
 *   --dry-run        Print the generated JSON; no writes (no other flags required)
 *
 * Environment (scripts/.env):
 *   STRAPI_URL      (default: http://localhost:1339)
 *   STRAPI_TOKEN    API token for Strapi
 *   OPENAI_API_KEY  OpenAI API key
 *
 * Publish caveat (Strapi v5): a REST `PUT { publishedAt }` updates the DRAFT version;
 * for content that is already live this may not surface until you publish the document.
 * The robust path is the document service. Run from backend/ (no port bind):
 *   node -e "require('@strapi/strapi').createStrapi().load().then(async a=>{ \
 *     await a.documents('api::site.site').publish({documentId:'…'}); \
 *     await a.documents('api::review.review').publish({documentId:'…'}); process.exit(0)})"
 * or simply publish from the Strapi admin.
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

// ── Config ─────────────────────────────────────────────────────────────────────

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TOKEN) { console.error('Error: STRAPI_TOKEN is required.'); process.exit(1); }
if (!OPENAI_API_KEY) { console.error('Error: OPENAI_API_KEY is required.'); process.exit(1); }

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const SITE_PROMPT = readFileSync(join(__dirname, 'faqs-site-prompt.md'), 'utf-8');
const REVIEW_PROMPT = readFileSync(join(__dirname, 'faqs-review-prompt.md'), 'utf-8');

// USD per 1M tokens. Override via env. Token counts are exact; $ is an estimate.
const PRICE = {
  'gpt-5.5': { in: Number(process.env.OPENAI_PRICE_GPT55_IN ?? 1.25), out: Number(process.env.OPENAI_PRICE_GPT55_OUT ?? 10) },
};
const costOf = (model, usage) => {
  const p = PRICE[model];
  if (!p || !usage) return 0;
  return ((usage.prompt_tokens || 0) * p.in + (usage.completion_tokens || 0) * p.out) / 1e6;
};
const tok = (u) => (u ? `${u.prompt_tokens}→${u.completion_tokens}` : 'n/a');

const CURRENT_YEAR = new Date().getFullYear();

// ── CLI Parsing ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const allMode = args.includes('--all');
const forceMode = args.includes('--force');
const publishMode = args.includes('--publish');
const dryRun = args.includes('--dry-run');
const siteOnly = args.includes('--site-only');
const reviewOnly = args.includes('--review-only');
// --batch: one async OpenAI Batch job for all sites (~50% cheaper); submits, polls, then writes.
const batchMode = args.includes('--batch');

const slugs = args.filter((a) => !a.startsWith('--'));

if (siteOnly && reviewOnly) {
  console.error('Error: pass at most one of --site-only / --review-only.');
  process.exit(1);
}
if (!allMode && slugs.length === 0) {
  console.error('Usage: node scripts/generate-faqs.mjs [--all | slug1 slug2 ...] [--site-only|--review-only] [--force] [--publish] [--dry-run] [--batch]');
  process.exit(1);
}
if (batchMode && dryRun) { console.error('Error: --batch and --dry-run are mutually exclusive.'); process.exit(1); }

const wantSite = !reviewOnly;
const wantReview = !siteOnly;

// ── Strapi Helpers ─────────────────────────────────────────────────────────────

const REVIEW_POPULATE = [
  'populate[0]=site',
  'populate[1]=site.offers',
  'populate[2]=site.platform',
  'populate[3]=site.platform.paymentMethods',
  'populate[4]=site.categories',
  'populate[5]=site.faqs',
  'populate[6]=site.typeDetails',
  'populate[7]=faqs',
  'populate[8]=paysiteScores',
  'populate[9]=camsiteScores',
].join('&');

/** Published reviews (the basis), each with its fully-populated site. */
async function fetchReviews() {
  let page = 1;
  const pageSize = 50;
  const all = [];
  while (true) {
    let url = `${STRAPI_URL}/api/reviews?${REVIEW_POPULATE}&filters[publishedAt][$notNull]=true&pagination[page]=${page}&pagination[pageSize]=${pageSize}`;
    if (!allMode && slugs.length > 0) {
      slugs.forEach((slug, i) => { url += `&filters[site][slug][$in][${i}]=${encodeURIComponent(slug)}`; });
    }
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to fetch reviews page ${page}: ${res.status} ${await res.text()}`);
    const { data, meta } = await res.json();
    all.push(...data);
    if (page >= (meta?.pagination?.pageCount ?? 1)) break;
    page++;
  }
  return all;
}

async function putFaqs(collection, documentId, faqs) {
  const res = await fetch(`${STRAPI_URL}/api/${collection}/${documentId}`, {
    method: 'PUT', headers, body: JSON.stringify({ data: { faqs } }),
  });
  if (!res.ok) throw new Error(`Failed to update ${collection}/${documentId}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function publishDoc(collection, documentId) {
  const res = await fetch(`${STRAPI_URL}/api/${collection}/${documentId}`, {
    method: 'PUT', headers, body: JSON.stringify({ data: { publishedAt: new Date().toISOString() } }),
  });
  if (!res.ok) throw new Error(`Failed to publish ${collection}/${documentId}: ${res.status}`);
}

// ── Prompt building ──────────────────────────────────────────────────────────────

function stripHtml(input) {
  if (!input) return '';
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return str.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function cleanFaqs(arr) {
  return Array.isArray(arr)
    ? arr.filter((f) => f?.question && f?.answer).map((f) => ({ question: String(f.question), answer: String(f.answer) }))
    : [];
}

function siteContext(site) {
  let p = `## Site\n`;
  p += `- Name: ${site.name}\n- Site type: ${site.siteType}\n`;
  if (site.short_description) p += `- Short description: ${site.short_description}\n`;
  if (site.included) p += `- Included networks/bonus sites: ${site.included}\n`;
  if (site.categories?.length) p += `- Categories: ${site.categories.map((c) => c.slug).join(', ')}\n`;
  if (site.platform?.name) p += `- Operated by: ${site.platform.name}\n`;
  const activeOffers = (site.offers ?? []).filter((o) => o.isActive);
  if (activeOffers.length) {
    const planTypes = [...new Set(activeOffers.map((o) => o.offerType || o.offerKind).filter(Boolean))];
    p += `- Plan types available (NO exact prices — those are dynamic): ${planTypes.join(', ')}\n`;
    if (activeOffers.some((o) => o.allowsDownloads)) p += `- Some plans allow downloads.\n`;
  }
  const desc = stripHtml(site.description);
  if (desc) p += `\n### Editorial description\n${desc.slice(0, 2000)}\n`;
  return p;
}

function reviewContext(review) {
  let p = `## Review\n`;
  if (review.overallScore != null) p += `- Overall score: ${review.overallScore}/10\n`;
  const scores = review.paysiteScores ?? review.camsiteScores;
  if (scores) {
    const pairs = Object.entries(scores)
      .filter(([k, v]) => typeof v === 'number' && !['id'].includes(k))
      .map(([k, v]) => `${k}:${v}`);
    if (pairs.length) p += `- Score breakdown (1–10): ${pairs.join(', ')}\n`;
  }
  if (review.description) p += `- Summary: ${review.description}\n`;
  const body = stripHtml(review.content);
  if (body) p += `\n### Review body\n${body.slice(0, 6000)}\n`;
  return p;
}

// Verified, data-rich facts from the consolidated externalContext. These are the ONLY
// numbers the review FAQs may cite (library size, video counts, quality, cadence, year).
function factsContext(site) {
  const ec = site.externalContext;
  if (!ec || typeof ec !== 'object') return '';
  const sf = ec.siteFacts || {};
  const lines = [];
  const add = (label, v) => { if (v && String(v).trim()) lines.push(`- ${label}: ${Array.isArray(v) ? v.join(', ') : v}`); };
  add('Founded', sf.founded);
  add('Network', sf.networkAffiliation);
  add('Content volume', sf.contentVolume);
  add('Update frequency', sf.updateFrequency);
  add('Exclusive content', sf.exclusiveContent);
  add('Video quality', sf.videoQuality);
  add('Notable features', sf.notableFeatures);
  add('Notable performers', sf.notablePerformers);
  add('Content niches', sf.contentNiches);
  if (ec.contentHighlights) lines.push(`- Highlights: ${stripHtml(ec.contentHighlights).slice(0, 400)}`);
  if (Array.isArray(ec.knownIssues) && ec.knownIssues.length) lines.push(`- Known issues: ${ec.knownIssues.join('; ')}`);
  if (!lines.length) return '';
  return `## Verified data (externalContext — the ONLY source of numbers/facts you may cite)\n${lines.join('\n')}\n`;
}

function buildUserPrompt(site, review) {
  let p = '';
  p += siteContext(site);
  const facts = factsContext(site);
  if (facts) p += `\n${facts}`;                       // verified content data — for BOTH site & review FAQs
  if (wantReview) p += `\n${reviewContext(review)}`;
  p += `\n## Task\nWrite FAQs for "${site.name}" for ${CURRENT_YEAR}. Return ONLY valid JSON of the form:\n`;
  p += `{ ${wantSite ? '"siteFaqs": [{ "question": "...", "answer": "..." }]' : ''}${wantSite && wantReview ? ', ' : ''}${wantReview ? '"reviewFaqs": [{ "question": "...", "answer": "..." }]' : ''} }\n`;
  if (wantSite && !wantReview) p += `Only produce "siteFaqs".\n`;
  if (wantReview && !wantSite) p += `Only produce "reviewFaqs".\n`;
  return p;
}

const MODEL = 'gpt-5.5';
// gpt-5.5 is a reasoning model: max_completion_tokens covers reasoning + visible output.
// 2500 was too low — reasoning alone could consume it, yielding empty content (finish_reason
// "length"). Give ample headroom so the JSON answer is always emitted.
const MAX_TOKENS = 6000;

// Shared request body for both the sync call and the batch JSONL.
function buildMessages(site, review) {
  // Combine both role-prompts so a single call has shared context; instruct which keys to emit.
  let system = '';
  if (wantSite) system += SITE_PROMPT;
  if (wantSite && wantReview) system += `\n\n---\n\n`;
  if (wantReview) system += REVIEW_PROMPT;
  return [
    { role: 'system', content: system },
    { role: 'user', content: buildUserPrompt(site, review) },
  ];
}

async function generateFaqs(site, review) {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: buildMessages(site, review),
    max_completion_tokens: MAX_TOKENS,
    response_format: { type: 'json_object' },
  });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('No response from GPT-5.5');
  const parsed = JSON.parse(raw);
  return {
    siteFaqs: cleanFaqs(parsed.siteFaqs),
    reviewFaqs: cleanFaqs(parsed.reviewFaqs),
    usage: response.usage,
  };
}

// Decide which flavours a target needs (respects --site-only/--review-only/--force).
function workFor(review) {
  const site = review.site;
  const doSite = wantSite && (forceMode || !(site.faqs ?? []).length);
  const doReview = wantReview && (forceMode || !(review.faqs ?? []).length);
  return { site, review, doSite, doReview };
}

// Persist one site's generated FAQs (used by both sync and batch paths).
async function writeFaqs({ site, review, doSite, doReview }, gen) {
  let s = 0, r = 0;
  if (doSite && gen.siteFaqs.length) {
    await putFaqs('sites', site.documentId, gen.siteFaqs);
    if (publishMode) await publishDoc('sites', site.documentId);
    s = gen.siteFaqs.length;
  }
  if (doReview && gen.reviewFaqs.length) {
    await putFaqs('reviews', review.documentId, gen.reviewFaqs);
    if (publishMode) await publishDoc('reviews', review.documentId);
    r = gen.reviewFaqs.length;
  }
  return { s, r };
}

// ── Batch path (OpenAI Batch API — ~50% cheaper, async) ─────────────────────────
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function runBatch(targets) {
  const work = targets.map(workFor).filter((w) => w.doSite || w.doReview);
  const skipped = targets.length - work.length;
  if (work.length === 0) { console.log('Nothing to do (all have FAQs; use --force).'); return; }

  // Build JSONL: one chat request per review, custom_id = review documentId (unique —
  // slug could collide if a site has >1 published review, which the Batch API rejects).
  const lines = work.map((w) => JSON.stringify({
    custom_id: w.review.documentId,
    method: 'POST',
    url: '/v1/chat/completions',
    body: { model: MODEL, messages: buildMessages(w.site, w.review), max_completion_tokens: MAX_TOKENS, response_format: { type: 'json_object' } },
  }));
  console.log(`Submitting batch: ${work.length} requests (${skipped} skipped)...`);

  const inputFile = await openai.files.create({
    file: new File([lines.join('\n') + '\n'], 'faqs-batch.jsonl', { type: 'application/jsonl' }),
    purpose: 'batch',
  });
  let batch = await openai.batches.create({ input_file_id: inputFile.id, endpoint: '/v1/chat/completions', completion_window: '24h' });
  console.log(`  batch id: ${batch.id} — polling (this can take minutes to hours; safe to leave running)`);

  const DONE = ['completed', 'failed', 'expired', 'cancelled'];
  while (!DONE.includes(batch.status)) {
    await sleep(15000);
    batch = await openai.batches.retrieve(batch.id);
    const c = batch.request_counts || {};
    console.log(`  status: ${batch.status} — ${c.completed || 0}/${c.total || 0} done${c.failed ? `, ${c.failed} failed` : ''}`);
  }
  if (batch.status !== 'completed') {
    console.error(`Batch ${batch.status}. ${batch.errors ? JSON.stringify(batch.errors).slice(0, 300) : ''}`);
    if (!batch.output_file_id) return;
  }

  // Download + parse results, map by custom_id (slug).
  const out = await (await openai.files.content(batch.output_file_id)).text();
  const byId = new Map();
  for (const line of out.trim().split('\n')) { if (!line) continue; const o = JSON.parse(line); byId.set(o.custom_id, o); }
  const workById = new Map(work.map((w) => [w.review.documentId, w]));

  let siteWrites = 0, reviewWrites = 0, failed = 0, batchCost = 0;
  for (const [cid, o] of byId) {
    const w = workById.get(cid);
    if (!w) continue;
    const slug = w.site.slug;
    try {
      if (o.error || o.response?.status_code >= 300) throw new Error(o.error?.message || `status ${o.response?.status_code}`);
      const body = o.response.body;
      const content = body?.choices?.[0]?.message?.content || '';
      const finish = body?.choices?.[0]?.finish_reason;
      if (!content) throw new Error(`empty content (finish_reason: ${finish}${finish === 'length' ? ' — raise MAX_TOKENS' : ''})`);
      const parsed = JSON.parse(content);
      const gen = { siteFaqs: cleanFaqs(parsed.siteFaqs), reviewFaqs: cleanFaqs(parsed.reviewFaqs) };
      batchCost += costOf(MODEL, body.usage) * 0.5; // Batch API ≈ 50% off
      const { s, r } = await writeFaqs(w, gen);
      if (s) siteWrites++;
      if (r) reviewWrites++;
      console.log(`  ✓ ${slug} — site:${s} review:${r}`);
    } catch (e) { failed++; console.error(`  ✗ ${slug}: ${e.message}`); }
  }

  console.log('\n━━━ Batch summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Requests: ${work.length} | site.faqs written: ${siteWrites} | review.faqs written: ${reviewWrites} | failed: ${failed} | skipped: ${skipped}`);
  console.log(`Estimated OpenAI cost (batch ≈50% off): $${batchCost.toFixed(4)}`);
  console.log(publishMode ? 'Mode: published' : 'Mode: draft (publish in admin or via document service — see header)');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching published reviews from Strapi...');
  const reviews = await fetchReviews();
  // One row per site; the review carries the populated site.
  const targets = reviews.filter((r) => r.site?.documentId);
  console.log(`Found ${targets.length} site(s) with a published review.\n`);
  if (targets.length === 0) return;

  if (batchMode) { await runBatch(targets); return; }

  let processed = 0, siteWrites = 0, reviewWrites = 0, skipped = 0, totalCost = 0;
  const errors = [];

  for (const review of targets) {
    const site = review.site;
    const siteHasFaqs = (site.faqs ?? []).length > 0;
    const reviewHasFaqs = (review.faqs ?? []).length > 0;

    const doSite = wantSite && (forceMode || !siteHasFaqs);
    const doReview = wantReview && (forceMode || !reviewHasFaqs);

    if (!doSite && !doReview) {
      console.log(`⏭  ${site.name} — FAQs already present, skipping (use --force to overwrite)`);
      skipped++;
      continue;
    }

    console.log(`🤖 ${site.name} (${site.slug}) — generating FAQs...`);
    processed++;

    try {
      const gen = await generateFaqs(site, review);
      const cost = costOf('gpt-5.5', gen.usage);
      totalCost += cost;
      console.log(`  💵 gpt-5.5 ${tok(gen.usage)} | est. $${cost.toFixed(4)} | site:${gen.siteFaqs.length} review:${gen.reviewFaqs.length}`);

      if (dryRun) {
        console.log(JSON.stringify({ site: site.slug, siteFaqs: gen.siteFaqs, reviewFaqs: gen.reviewFaqs }, null, 2));
        continue;
      }

      if (doSite && gen.siteFaqs.length) {
        await putFaqs('sites', site.documentId, gen.siteFaqs);
        if (publishMode) await publishDoc('sites', site.documentId);
        siteWrites++;
        console.log(`  ✓ site.faqs ← ${gen.siteFaqs.length}`);
      }
      if (doReview && gen.reviewFaqs.length) {
        await putFaqs('reviews', review.documentId, gen.reviewFaqs);
        if (publishMode) await publishDoc('reviews', review.documentId);
        reviewWrites++;
        console.log(`  ✓ review.faqs ← ${gen.reviewFaqs.length}`);
      }
    } catch (err) {
      errors.push({ site: site.name, error: err.message });
      console.error(`  ✗ ${site.name}: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 2000)); // gentle rate limit
  }

  console.log('\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Processed: ${processed} | site.faqs written: ${siteWrites} | review.faqs written: ${reviewWrites} | Skipped: ${skipped}`);
  console.log(`Estimated OpenAI cost: $${totalCost.toFixed(4)}`);
  console.log(dryRun ? 'Mode: dry-run (no writes)' : publishMode ? 'Mode: published' : 'Mode: draft (publish in admin or via document service — see header)');
  if (errors.length) {
    console.log(`\n✗ Errors (${errors.length}):`);
    for (const e of errors) console.log(`  • ${e.site}: ${e.error}`);
  }
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
