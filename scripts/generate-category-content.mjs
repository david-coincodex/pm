#!/usr/bin/env node
/**
 * generate-category-content.mjs
 *
 * Writes the editorial body of the `/best-<category>-sites/` pages with GPT-5.5, from our own
 * catalog only — no scraping, no image pipeline.
 *
 * Per category:
 *   rank the category's sites → build a candidate list → generate
 *   { description, intro, content, faqs } → sanitize → insert cover images → PUT onto the Category.
 *
 * The category template renders `intro`, then the site cards, then `content`, then `faqs`
 * (see frontend/src/app/[locale]/(chrome)/[slug]/page.tsx). So the model writes the setup, the
 * per-site detail, and the Q&A — never the card list, which the template owns.
 *
 * ⚠️ The prose is a ranked top 5 (main sites by review score, then channels by review score — see
 * rankCategorySites). The template's card list is a separate, name-sorted, paginated browse list,
 * so the two orders deliberately DIFFER and the prompt tells the model not to reference the cards
 * as "the list above". If the card list is ever changed to share this ranking, drop that caveat.
 *
 * Dry run is the DEFAULT — it still calls the model (that is the part worth previewing) but writes
 * nothing, and prints the description, intro, and the head of the content for review.
 *
 * Usage:
 *   node scripts/generate-category-content.mjs cosplay-porn        # preview one
 *   node scripts/generate-category-content.mjs cosplay-porn --apply
 *   node scripts/generate-category-content.mjs --all --apply
 *
 * Options:
 *   --all                Process every category
 *   --apply              Write to Strapi (omit to preview)
 *   --force              Overwrite a category that already has intro/content
 *   --max-entries <n>    Ranked entries to write about (default 5)
 *   --model <name>       Override the model (default gpt-5.5)
 *
 * Environment: STRAPI_URL, STRAPI_TOKEN, OPENAI_API_KEY
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
if (!TOKEN) { console.error('Error: STRAPI_TOKEN is required (scripts/.env).'); process.exit(1); }
if (!OPENAI_API_KEY) { console.error('Error: OPENAI_API_KEY is required (scripts/.env).'); process.exit(1); }

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const CURRENT_YEAR = new Date().getFullYear();
const SYSTEM_PROMPT = readFileSync(join(__dirname, 'category-content-prompt.md'), 'utf-8');

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
function flag(name, fallback) {
  const i = argv.indexOf(name);
  const next = argv[i + 1];
  // A following flag is not this flag's value — `--max-entries --apply` must not eat `--apply`.
  return i !== -1 && next && !next.startsWith('--') ? next : fallback;
}
const ALL = has('--all');
const APPLY = has('--apply');
const FORCE = has('--force');
const MAX_ENTRIES = Number(flag('--max-entries', 5));
if (!Number.isInteger(MAX_ENTRIES) || MAX_ENTRIES < 1) {
  // Without this, NaN reaches slice(0, NaN) and every category reports "no active sites".
  console.error(`Error: --max-entries must be a positive integer, got "${flag('--max-entries', 5)}".`);
  process.exit(1);
}
const MODEL = flag('--model', 'gpt-5.5');
// Positional args are category slugs; drop flags and their values.
const VALUE_FLAGS = new Set(['--max-entries', '--model']);
const slugArgs = argv.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]));

// USD per 1M tokens — override via env. The token counts logged are exact (from the API); the $
// figure is only as right as these rates. Verify at https://openai.com/api/pricing/
const PRICE = {
  in: Number(process.env.OPENAI_PRICE_GPT55_IN ?? 1.25),
  out: Number(process.env.OPENAI_PRICE_GPT55_OUT ?? 10),
};
const costOf = (u) => (!u ? 0 : ((u.prompt_tokens || 0) * PRICE.in + (u.completion_tokens || 0) * PRICE.out) / 1e6);

// ── Strapi ────────────────────────────────────────────────────────────────────
async function strapiFetch(path) {
  const res = await fetch(`${STRAPI_URL}/api${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function fetchCategories() {
  const out = [];
  for (let page = 1; ; page += 1) {
    const { data, meta } = await strapiFetch(
      `/categories?fields[0]=name&fields[1]=slug&fields[2]=description&fields[3]=intro&fields[4]=content` +
        `&pagination[page]=${page}&pagination[pageSize]=100&locale=en&status=draft`,
    );
    out.push(...data);
    if (page >= (meta?.pagination?.pageCount ?? 1)) break;
  }
  return out;
}

const SITE_FIELDS =
  'fields[0]=name&fields[1]=slug&fields[2]=short_description&fields[3]=externalContext' +
  '&populate[parent_site][fields][0]=slug&populate[cover_image][fields][0]=url&populate[logo][fields][0]=url';

/** Sites in a category, split by whether they are a network parent or one of its channels. */
async function fetchByParentage(categorySlug, isSub) {
  const parentFilter = isSub ? 'filters[parent_site][$notNull]=true' : 'filters[parent_site][$null]=true';
  // Paged to exhaustion: truncating here would happen BEFORE score-ranking, so in a large
  // category a top-scored site past row 100 (alphabetically) would silently never be considered.
  const out = [];
  for (let page = 1; ; page += 1) {
    const { data, meta } = await strapiFetch(
      `/sites?${SITE_FIELDS}&filters[isActive][$eq]=true&${parentFilter}` +
        `&filters[categories][slug][$eq]=${encodeURIComponent(categorySlug)}` +
        `&sort=name:asc&pagination[page]=${page}&pagination[pageSize]=100`,
    );
    out.push(...data);
    if (page >= (meta?.pagination?.pageCount ?? 1)) break;
  }
  return out;
}

/**
 * The ranked entries for a category: main sites first, then sub-sites, each group ordered by our
 * published review score, highest first.
 *
 * Main-before-sub is a deliberate editorial rule, not a sort key: a network parent is what a reader
 * in a genre actually wants to subscribe to, and a single channel from that network — however good
 * — is a narrower purchase. So a strong channel never outranks a weaker parent.
 *
 * Unrated sites sink to the bottom of their own group but stay eligible, matching
 * fetchNetworkSites in generate-toplists.mjs.
 */
async function rankCategorySites(categorySlug, limit) {
  const [mains, subs] = await Promise.all([
    fetchByParentage(categorySlug, false),
    fetchByParentage(categorySlug, true),
  ]);

  const reviews = await fetchReviewsBySlugs([...mains, ...subs].map((s) => s.slug));
  const withScores = (rows) =>
    rows
      .map((s) => ({ site: s, review: reviews.get(s.slug) ?? null }))
      .sort((a, b) => (b.review?.overallScore ?? -1) - (a.review?.overallScore ?? -1));

  return [...withScores(mains), ...withScores(subs)].slice(0, limit);
}

/**
 * Published reviews for a set of site slugs, as slug -> { overallScore, description }.
 *
 * One `$in` query per chunk instead of one request per site — a broad category was previously
 * bursting ~100 concurrent requests at Strapi for data this returns in one or two. Chunked so a
 * very large category cannot overflow the URL line.
 */
async function fetchReviewsBySlugs(slugs) {
  const out = new Map();
  for (let i = 0; i < slugs.length; i += 40) {
    const chunk = slugs.slice(i, i + 40);
    const filter = chunk.map((s, j) => `filters[site][slug][$in][${j}]=${encodeURIComponent(s)}`).join('&');
    const { data } = await strapiFetch(
      `/reviews?${filter}&filters[publishedAt][$notNull]=true` +
        `&fields[0]=overallScore&fields[1]=description&populate[site][fields][0]=slug&pagination[pageSize]=100`,
    );
    for (const r of data) {
      if (r.site?.slug && !out.has(r.site.slug)) {
        out.set(r.site.slug, { overallScore: r.overallScore ?? null, description: r.description ?? null });
      }
    }
  }
  return out;
}

async function updateCategory(documentId, data) {
  const res = await fetch(`${STRAPI_URL}/api/categories/${documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(`PUT category ${documentId}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── Media + quotes ────────────────────────────────────────────────────────────
/** Strip any scheme+host so a stored src works on whatever host serves /uploads. */
const relativeMedia = (url) => (url ? url.replace(/^https?:\/\/[^/]+/, '') : null);

/**
 * Short attributed snippets from external reviewers, as harvested into `externalContext`.
 *
 * Capped at two per site and passed verbatim so the model can only quote what a real source
 * actually said — it is told never to invent or reword one. Same field the toplist pipeline reads.
 */
function quotesFor(site) {
  const opinions = site.externalContext?.reviewerOpinions;
  if (!Array.isArray(opinions)) return [];
  return opinions
    .map((o) => ({ text: (o.quotableSnippet || o.verdict || '').trim(), source: (o.sourceName || '').trim() }))
    .filter((q) => q.text && q.source && q.text.length <= 220)
    .slice(0, 2);
}

const normKey = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Put each entry's cover image directly above its <h2>.
 *
 * Done here rather than by the model because the prompt forbids it from emitting <img> at all —
 * letting it write image markup means invented filenames. Headings are matched to candidates by
 * the site name in `1. <Name> — <tagline>`, so a heading the model reworded simply gets no image
 * rather than the wrong one.
 */
/** Minimal escaping for text placed inside a double-quoted HTML attribute. */
const attrEscape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function insertCoverImages(html, candidates) {
  const byKey = new Map(candidates.filter((c) => c.coverUrl).map((c) => [normKey(c.name), c]));
  const report = [];
  const used = new Set();

  return {
    html: html.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (heading, inner) => {
      const text = inner.replace(/<[^>]+>/g, ' ').trim();
      if (!/^\s*\d+[.)]/.test(text)) return heading; // skip "How we picked these" / "Verdict"
      // Tagline separator is a SPACED dash (`Name — tagline`), per the prompt. Splitting on a bare
      // `-` would truncate a hyphenated site name ("Rub-A-Teen" -> "Rub") and silently lose its image.
      const name = text.replace(/^\s*\d+[.)]\s*/, '').split(/\s+[—–-]\s+|[:|]/)[0].trim();
      const c = byKey.get(normKey(name));
      if (!c || used.has(c.slug)) { report.push({ entry: name, image: 'none' }); return heading; }
      used.add(c.slug);
      report.push({ entry: name, image: c.coverUrl });
      // Function replacement: a `$` in a filename must not become a replacement pattern.
      return `<img src="${attrEscape(c.coverUrl)}" alt="${attrEscape(c.name)}" />\n${heading}`;
    }),
    report,
  };
}

// ── Prompt ────────────────────────────────────────────────────────────────────
function buildUserPrompt(category, candidates) {
  const lines = candidates.map((c, i) => {
    const kind = c.isSub ? ` [channel of ${c.parentSlug}]` : ' [main site]';
    const bits = [`${i + 1}. ${c.name} (slug: ${c.slug})${kind}`];
    if (c.shortDescription) bits.push(`   description: ${c.shortDescription}`);
    if (c.highlights) bits.push(`   content highlights: ${c.highlights}`);
    if (c.reviewScore != null) bits.push(`   our review score: ${c.reviewScore}/10`);
    if (c.reviewSummary) bits.push(`   our review summary: ${c.reviewSummary}`);
    for (const q of c.opinionQuotes ?? []) {
      bits.push(`   quotable (${q.source}): "${q.text}"`);
    }
    return bits.join('\n');
  });

  return `Current year: ${CURRENT_YEAR}

Category: ${category.name}
Category slug: ${category.slug}
Page URL: /best-${category.slug}-sites/
Page H1: Best ${category.name} Sites

Write the category page body for this genre.

Sites to cover — ${candidates.length} entries, already ranked. Write them in THIS order and number
them from 1; do not reorder, drop, or add any:

${lines.join('\n\n')}

The ranking puts main sites above channels, and orders each group by our review score. Where a
channel appears below a lower-scoring main site, that is deliberate — a network subscription is the
broader purchase — and you may say so where it helps the reader.

Ground every specific claim in the lines above. Where a site has no highlights or review summary,
keep its entry shorter and more general rather than inventing detail.

Where a "quotable" line is supplied and it adds something your own prose does not, you may use ONE
per entry as an attributed <blockquote>, reproduced word for word with the source named. Never
reword a quote, never attribute one to a source that was not given for that site, and skip the
quote entirely where it would just restate your paragraph. Return JSON only.`;
}

async function generate(userPrompt) {
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: 8000,
    response_format: { type: 'json_object' },
  });
  const raw = res.choices[0]?.message?.content;
  if (!raw) throw new Error(`No response from ${MODEL}`);
  return { data: JSON.parse(raw), usage: res.usage };
}

// ── Sanitize / validate ───────────────────────────────────────────────────────
/**
 * Strip what the prompt forbids but a model still occasionally emits.
 *
 * The card-list strip is the important one: the template renders the cards itself, so a widget in
 * `content` shows the same sites twice on the page.
 */
function sanitize(html) {
  if (typeof html !== 'string') return { html: '', notes: [] };
  const notes = [];
  let out = html;

  const drop = (re, label) => {
    const before = out;
    out = out.replace(re, '');
    if (out !== before) notes.push(label);
  };
  drop(/<div\b[^>]*\bdata-component="site-card-list"[^>]*>[\s\S]*?<\/div>/g, 'removed site-card-list widget');
  drop(/<div\b[^>]*\bdata-component="site-card"[^>]*>[\s\S]*?<\/div>/g, 'removed site-card widget');
  drop(/<img\b[^>]*>/g, 'removed <img>');
  drop(/<h1\b[^>]*>[\s\S]*?<\/h1>/g, 'removed <h1> (page supplies it)');

  return { html: out.trim(), notes };
}

/** Prices are banned in prose because the cards carry live figures. Warn loudly; do not auto-edit. */
function priceWarnings(text) {
  const hits = new Set();
  for (const re of [/\$\s?\d/g, /\b\d{1,3}\s?% off\b/gi, /\b\d+-day trial\b/gi, /\bUSD\b/g]) {
    for (const m of text.match(re) ?? []) hits.add(m.trim());
  }
  return [...hits];
}

function validate(out, expectedEntries) {
  const problems = [];
  for (const k of ['description', 'intro', 'content']) {
    if (typeof out[k] !== 'string' || !out[k].trim()) problems.push(`missing ${k}`);
  }
  if (!Array.isArray(out.faqs)) problems.push('faqs is not an array');
  const h2s = (out.content?.match(/<h2\b/g) ?? []).length;
  // entries + "How we picked these" + "Verdict"
  const expected = expectedEntries + 2;
  if (h2s < expected) problems.push(`only ${h2s} <h2> in content, expected ~${expected}`);
  if ((out.description ?? '').length > 200) problems.push(`description is ${out.description.length} chars (>200)`);
  return problems;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!ALL && slugArgs.length === 0) {
    console.error('Nothing to do. Pass one or more category slugs, or --all. Writes nothing unless --apply.');
    process.exit(1);
  }

  const all = await fetchCategories();
  const bySlug = new Map(all.map((c) => [c.slug, c]));
  const targets = ALL ? all : slugArgs.map((s) => bySlug.get(s) ?? { slug: s, missing: true });

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${STRAPI_URL} | model ${MODEL} | ${targets.length} categor${targets.length === 1 ? 'y' : 'ies'}\n`);

  let written = 0, skipped = 0, failed = 0, cost = 0;

  for (const category of targets) {
    const label = category.slug;
    if (category.missing) { console.log(`! ${label}: no such category, skipped`); skipped++; continue; }

    const hasBody = (category.intro ?? '').trim() || (category.content ?? '').trim();
    if (hasBody && !FORCE) {
      console.log(`= ${label}: already has a body, left alone (use --force to replace)`);
      skipped++; continue;
    }

    try {
      const ranked = await rankCategorySites(category.slug, MAX_ENTRIES);
      if (ranked.length === 0) {
        console.log(`! ${label}: no active sites in this category, skipped (nothing to rank)`);
        skipped++; continue;
      }

      const candidates = ranked.map(({ site: s, review }) => ({
        name: s.name,
        slug: s.slug,
        isSub: !!s.parent_site,
        parentSlug: s.parent_site?.slug ?? null,
        shortDescription: s.short_description ?? null,
        highlights: s.externalContext?.contentHighlights ?? null,
        reviewScore: review?.overallScore ?? null,
        reviewSummary: review?.description ?? null,
        // Already on our media. Stored host-relative — interpolating STRAPI_URL would bake the
        // generating host into the category body, which 404s anywhere else.
        coverUrl: relativeMedia(s.cover_image?.url ?? s.logo?.url ?? null),
        opinionQuotes: quotesFor(s),
      }));

      const { data: out, usage } = await generate(buildUserPrompt(category, candidates));
      cost += costOf(usage);

      const intro = sanitize(out.intro);
      const contentClean = sanitize(out.content);
      // Images go in AFTER sanitizing, which strips any <img> the model emitted against instructions.
      const withImages = insertCoverImages(contentClean.html, candidates);
      const content = { html: withImages.html, notes: contentClean.notes };

      const notes = [...new Set([...intro.notes, ...content.notes])];
      const problems = validate({ ...out, intro: intro.html, content: content.html }, candidates.length);
      const prices = priceWarnings(`${out.description ?? ''} ${intro.html} ${content.html}`);
      const imaged = withImages.report.filter((r) => r.image !== 'none').length;
      const quoted = (content.html.match(/<blockquote/g) ?? []).length;

      const faqs = (out.faqs ?? [])
        .filter((f) => f?.question && f?.answer)
        .map((f) => ({ question: String(f.question), answer: String(f.answer) }));

      console.log(`${APPLY ? '~' : '?'} ${label}: ${candidates.length} sites | intro ${intro.html.length}c | content ${content.html.length}c | ${imaged}/${candidates.length} images | ${quoted} quotes | ${faqs.length} faqs | $${costOf(usage).toFixed(3)}`);
      console.log(`    ranking: ${candidates.map((c, i) => `${i + 1}. ${c.name}${c.isSub ? '*' : ''} (${c.reviewScore ?? '–'})`).join(', ')}   [* = channel]`);
      const noImage = withImages.report.filter((r) => r.image === 'none').map((r) => r.entry);
      if (noImage.length) console.log(`    ⚠ no image matched for: ${noImage.join(', ')}`);
      if (notes.length) console.log(`    sanitized: ${notes.join('; ')}`);
      if (prices.length) console.log(`    ⚠ price-like text in prose (prompt forbids it): ${prices.join(', ')}`);
      if (problems.length) console.log(`    ⚠ ${problems.join('; ')}`);

      if (!APPLY) {
        console.log(`    --- description ---\n    ${out.description}`);
        console.log(`    --- intro ---\n${intro.html.split('\n').map((l) => '    ' + l).join('\n')}`);
        console.log(`    --- content (first 600c) ---\n    ${content.html.slice(0, 600).replace(/\n/g, '\n    ')}…`);
        continue;
      }

      if (problems.length) {
        console.log(`    not written — fix the problems above or re-run (model output varies)`);
        failed++; continue;
      }

      await updateCategory(category.documentId, {
        // hasBody only guards intro/content, so a body-less category may still carry a
        // hand-written description — never replace that without --force.
        ...(!(category.description ?? '').trim() || FORCE ? { description: out.description } : {}),
        intro: intro.html,
        content: content.html,
        faqs,
      });
      written++;
    } catch (err) {
      console.log(`! ${label}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${APPLY ? 'Written' : 'Would write'}: ${written} | skipped: ${skipped} | failed: ${failed} | est. cost $${cost.toFixed(2)}`);
  if (!APPLY) console.log('Dry run — re-run with --apply to write to Strapi.');
}

main().catch((e) => { console.error(e); process.exit(1); });
