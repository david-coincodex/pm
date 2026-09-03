#!/usr/bin/env node
/**
 * generate-comparison-article.mjs
 *
 * Generates a head-to-head COMPARISON article between two cam sites (first use: Chaturbate vs
 * StripChat, issue #82) and writes it into local Strapi, ready for push-changed-content.mjs.
 * Same convention as the other article generators — one script + one prompt per article type.
 *
 * WHY THIS ONE IS THREE PASSES, not one
 * -------------------------------------
 * A comparison lives or dies on facts we don't own, and a single "write me a comparison" call
 * invents them confidently: model counts, token prices, launch years. So:
 *
 *   1. EXTRACT — each `--context` URL is fetched and reduced to a list of atomic claims, each
 *      carrying the source that made it. Claims that disagree across sources are marked
 *      `conflict`, because that disagreement is itself the most useful fact we have (the three
 *      sources we started with contradict each other on private-show pricing).
 *   2. WRITE — the writer gets ONLY those claims plus our own site pages, and is forbidden
 *      from stating any price at all: the live price belongs to the deal-card widget, which
 *      re-reads it from Strapi on every render.
 *   3. VERIFY — the finished body is checked back against the extracted claims, and
 *      mechanically for banned prices, missing links and missing widgets. Verification failure
 *      aborts before anything is written to Strapi.
 *
 * External context is REQUIRED and must be passed in: we do not guess which third-party
 * reviews are authoritative for a given pair.
 *
 * Usage:
 *   node scripts/generate-comparison-article.mjs \
 *     --a chaturbate --b stripchat \
 *     --context https://…,https://…,https://… \
 *     --cover ~/Downloads/stripchat-vs-chaturbate.png [--dry-run]
 *
 * Env (scripts/.env): STRAPI_URL, STRAPI_TOKEN, OPENAI_API_KEY.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname, extname } from 'path';
import { tmpdir, homedir } from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import OpenAI from 'openai';
import {
  STRAPI_URL, TOKEN, requireToken,
  api, articlesBySlug, createArticle, updateArticle, uploadLocalFile,
} from './lib/strapi.mjs';
import { hasFlag } from './lib/jobs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
_require('dotenv').config({ path: join(__dirname, '.env'), quiet: true });

const flag = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

const DRY_RUN = hasFlag('dry-run');
const SLUG_A = flag('a', 'chaturbate');
const SLUG_B = flag('b', 'stripchat');
const AUTHOR_SLUG = flag('author', 'mike-wood');
const CATEGORY_SLUG = flag('category', 'live-sex');
const SLUG = flag('slug', `${SLUG_A}-vs-${SLUG_B}`);
const COVER = flag('cover', '').replace(/^~/, homedir());
const CONTEXT_URLS = flag('context', '').split(',').map((s) => s.trim()).filter(Boolean);
const OUT_DIR = join(tmpdir(), `pm-comparison-${SLUG_A}-${SLUG_B}`);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MODEL = 'gpt-5.5';
const WIDGETS = ['DEAL_A', 'DEAL_B', 'MODELS_A', 'MODELS_B', 'PROS_CONS_A', 'PROS_CONS_B'];
/** Anything that looks like money or a token rate — the one thing the copy may never contain. */
const PRICE_PATTERNS = [
  /\$\s?\d/,
  /\b\d+(\.\d+)?\s*(usd|eur|cents?)\b/i,
  /\b\d+\s*tokens?\b/i,
  /\bper[- ]minute\b.*\b\d/i,
  /\b\d+\s?%\s*(off|discount|cheaper)/i,
];

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) { console.error('Error: OPENAI_API_KEY is required (scripts/.env).'); process.exit(1); }
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

if (CONTEXT_URLS.length === 0) {
  console.error(
    'Error: --context is required.\n' +
    '  Pass the third-party comparisons/reviews this article should be grounded in, comma-separated.\n' +
    '  Nothing external is assumed: the facts in the post come from those pages plus our own site data.',
  );
  process.exit(1);
}
if (!COVER || !existsSync(COVER)) {
  console.error(`Error: --cover <file> is required and must exist (got ${COVER || 'nothing'}).\n` +
    '  Comparison posts use a supplied head-to-head image, not the generated wordmark cover.');
  process.exit(1);
}

const SYSTEM_PROMPT_TEMPLATE = readFileSync(join(__dirname, 'comparison-article-prompt.md'), 'utf8');

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
      method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` },
    }).catch(() => {});
  }
}

/** Our own record for a site: copy, what's included, third-party quotes, and the offers. */
async function loadSite(slug) {
  const json = await api(
    `/sites?filters[slug][$eq]=${encodeURIComponent(slug)}&populate[offers]=true&pagination[pageSize]=1`,
  );
  const site = json.data?.[0];
  if (!site) throw new Error(`site not found in Strapi: ${slug}`);
  // The reviewers behind OUR review of this site. This is the only corpus the article may
  // quote from, so keep enough text to actually quote (4k, not the 1.2k a summary needs), and
  // drop sources we scraped nothing from — an empty source can only produce an invented quote.
  const quotes = (site.scrapedReviews?.sources ?? [])
    .filter((s) => s.sourceName && String(s.content ?? '').trim().length > 200)
    .map((s) => ({ source: s.sourceName, url: s.sourceUrl, text: String(s.content).slice(0, 4000) }));
  return {
    slug,
    name: site.name,
    documentId: site.documentId,
    shortDescription: site.short_description ?? null,
    included: site.included ?? null,
    description: (site.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2500),
    externalContext: site.externalContext ?? null,
    thirdPartyQuotes: quotes,
    activeOffers: (site.offers ?? []).filter((o) => o.isActive).length,
  };
}

/** Fetched page → plain text, cheap and good enough for a fact pass. */
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchContext(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`context fetch failed (${res.status}): ${url}`);
  const text = htmlToText(await res.text());
  if (text.length < 500) throw new Error(`context page yielded almost no text (${text.length} chars): ${url}`);
  return text.slice(0, 30_000);
}

const chat = async (system, user) => {
  const resp = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
  });
  const raw = resp.choices[0]?.message?.content;
  if (!raw) throw new Error('no response from the model');
  return JSON.parse(raw);
};

/** PASS 1 — atomic claims with their source, and explicit conflicts between sources. */
async function extractFacts(pages, nameA, nameB) {
  const system = [
    `You extract facts for a comparison between ${nameA} and ${nameB}.`,
    'Input: text of independent review pages, each with its source name and URL.',
    'Return ONE JSON object: { "claims": [ { "subject": "<site name|both>", "topic": "<short topic>",',
    '"claim": "<one factual sentence>", "source": "<source name>", "quote": "<verbatim sentence if notable, else null>",',
    '"isPrice": <true if the claim is about money/tokens/rates> } ],',
    '"conflicts": [ { "topic": "...", "positions": [ { "source": "...", "says": "..." } ] } ],',
    '"quotableLines": [ { "source": "...", "quote": "<verbatim, <=220 chars>" } ] }',
    'Rules: only what the pages state; no inference; attribute every claim; mark price claims with isPrice.',
    'Put anything two sources disagree about into conflicts as well as claims.',
  ].join('\n');
  const user = pages.map((p) => `### SOURCE: ${p.name} (${p.url})\n${p.text}`).join('\n\n');
  return chat(system, user);
}

/**
 * PASS 3 — does the written body actually follow from the evidence?
 *
 * The evidence is BOTH the extracted third-party claims AND our own site records: the writer is
 * given both, so checking against only one half fails perfectly good sentences (the first run
 * flagged an editorial verdict grounded in our own review copy).
 *
 * The two definitions below are deliberately narrow, because a fact-checker that flags
 * everything is the same as no fact-checker: the first version called every sentence containing
 * the word "free" a price mention, and 20 false positives hid the 2 real findings.
 */
async function verifyArticle(body, facts, ourSites, nameA, nameB) {
  const system = [
    `You fact-check a comparison of ${nameA} and ${nameB} against the permitted evidence.`,
    'Return ONE JSON object: { "unsupported": [ { "sentence": "...", "why": "..." } ],',
    '"priceMentions": [ "..." ], "misquotes": [ { "quote": "...", "why": "..." } ], "ok": <bool> }',
    '',
    'unsupported — ONLY a sentence making a checkable factual claim ABOUT ONE OF THE TWO CAM SITES',
    'that the evidence does not state (invented counts, features, years, ownership, rankings).',
    'NOT unsupported: editorial opinion and recommendations ("our call", "best for you if…"),',
    'anything about pornmode.com itself (our pages, links, deal cards, live listings), reader',
    'instructions, and framing sentences that assert nothing about either site.',
    '',
    'priceMentions — ONLY text containing an actual NUMBER used as money: a currency amount, a',
    'token/credit count, a per-minute rate, or a discount percentage. The bare words "free",',
    '"tip", "tipping", "tokens", "credits", "deal", "discount", "price" WITHOUT a number are',
    'NOT price mentions. Quote the offending fragment, not the whole sentence.',
    '',
    'misquotes — a blockquote whose wording does not appear in the evidence.',
    'ok = true only if all three lists are empty.',
  ].join('\n');
  const user = [
    `EVIDENCE — third-party claims:\n${JSON.stringify(facts)}`,
    `EVIDENCE — our own site records:\n${JSON.stringify(ourSites)}`,
    `ARTICLE BODY:\n${body}`,
  ].join('\n\n');
  return chat(system, user);
}

const figureless = (html) => html.replace(/\{\{[A-Z_]+\}\}/g, '').trim();

function widgetProblems(html) {
  const problems = [];
  for (const w of WIDGETS) {
    const n = (html.match(new RegExp(`\\{\\{${w}\\}\\}`, 'g')) ?? []).length;
    if (n !== 1) problems.push(`{{${w}}} appears ${n}× (expected 1)`);
  }
  const stray = [...html.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]).filter((x) => !WIDGETS.includes(x));
  if (stray.length) problems.push(`unknown placeholders: ${[...new Set(stray)].join(', ')}`);
  return problems;
}

function linkProblems(html, links) {
  return Object.values(links)
    .filter((url) => !html.includes(`href="${url}"`))
    .map((url) => `required link missing from the body: ${url}`);
}

function priceProblems(text) {
  return PRICE_PATTERNS.flatMap((re) => {
    const m = text.match(re);
    return m ? [`states a price, which the copy may never do (the deal card carries the live price): "${m[0]}"`] : [];
  });
}

const normalise = (t) =>
  t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Blockquotes may ONLY come from the reviewers behind our own reviews (scrapedReviews.sources),
 * never from the comparison pages passed as --context: those ground the facts, they are not
 * voices we present as reviews. Checked mechanically rather than trusted, in two parts —
 * the attribution names a source we actually hold, and the words are really in that source.
 */
function quoteProblems(html, sites) {
  const allowed = new Map();
  for (const site of sites) for (const q of site.thirdPartyQuotes) {
    allowed.set(normalise(q.source), normalise(`${allowed.get(normalise(q.source)) ?? ''} ${q.text}`));
  }
  const blocks = [...html.matchAll(/<blockquote>([\s\S]*?)<\/blockquote>/g)].map((m) => m[1]);
  if (blocks.length < 2) return [`only ${blocks.length} blockquote(s); at least 2 are required`];

  const problems = [];
  for (const block of blocks) {
    const attribution = block.match(/<footer>([\s\S]*?)<\/footer>/)?.[1] ?? '';
    const name = normalise(attribution.replace(/^[\s—–-]+/, ''));
    const quoted = normalise(block.replace(/<footer>[\s\S]*?<\/footer>/, '').replace(/<[^>]+>/g, ' ')).replace(/^["']|["'…]+$/g, '');
    if (!name) { problems.push(`a blockquote has no <footer> attribution`); continue; }
    const corpus = [...allowed.entries()].find(([source]) => name.includes(source) || source.includes(name))?.[1];
    if (!corpus) {
      problems.push(`blockquote attributed to "${attribution.trim()}", which is not one of our review sources (${[...allowed.keys()].join(', ')})`);
      continue;
    }
    // Match on the opening run: reviewers get trimmed with an ellipsis, but the first words
    // must be theirs verbatim — a paraphrase inside quotation marks is a fabricated quote.
    const head = quoted.slice(0, Math.min(60, quoted.length));
    if (head.length < 20) problems.push(`blockquote from "${attribution.trim()}" is too short to verify`);
    else if (!corpus.includes(head)) problems.push(`blockquote attributed to "${attribution.trim()}" is not verbatim in that source: "${head}…"`);
  }
  return problems;
}

/** Everything a draft must satisfy before it is worth fact-checking. */
function draftProblems(gen, links, sites) {
  const missingKeys = ['metaTitle', 'title', 'description', 'contentHtml', 'faqs', 'verdict', 'prosConsA', 'prosConsB']
    .filter((k) => gen[k] == null)
    .map((k) => `output is missing "${k}"`);
  if (missingKeys.length) return missingKeys;
  const prose = figureless(gen.contentHtml).replace(/<[^>]+>/g, ' ');
  const allCopy = [prose, gen.title, gen.metaTitle, gen.description, gen.verdict,
    ...gen.faqs.flatMap((f) => [f.question, f.answer]),
    ...(gen.prosConsA.pros ?? []), ...(gen.prosConsA.cons ?? []),
    ...(gen.prosConsB.pros ?? []), ...(gen.prosConsB.cons ?? [])].join(' \n ');
  return [
    ...widgetProblems(gen.contentHtml),
    ...linkProblems(gen.contentHtml, links),
    ...priceProblems(allCopy),
    ...quoteProblems(gen.contentHtml, sites),
  ];
}

const dealCard = (documentId) => `<div data-component="site-card" data-site-id="${documentId}"></div>`;
const modelsButton = (url, label) => `<p><a href="${url}" data-button="true">${label}</a></p>`;
const prosCons = (pc) =>
  `<div data-component="pros-cons" data-pros="${(pc?.pros ?? []).join('||')}" data-cons="${(pc?.cons ?? []).join('||')}"></div>`;

async function main() {
  if (!DRY_RUN) requireToken();
  mkdirSync(OUT_DIR, { recursive: true });

  // ── Our own data for both sites ───────────────────────────────────────────────
  const [a, b] = await Promise.all([loadSite(SLUG_A), loadSite(SLUG_B)]);
  console.log(`Comparing ${a.name} vs ${b.name}`);
  for (const s of [a, b]) {
    console.log(`  ${s.name}: ${s.thirdPartyQuotes.length} third-party review source(s), ${s.activeOffers} active offer(s)`);
    if (s.activeOffers === 0) console.warn(`  ⚠ ${s.name} has no active offer — its deal card will render without a price`);
  }

  // ── External context (required) ───────────────────────────────────────────────
  console.log(`Fetching ${CONTEXT_URLS.length} context page(s)…`);
  const pages = [];
  for (const url of CONTEXT_URLS) {
    const text = await fetchContext(url);
    pages.push({ url, name: new URL(url).hostname.replace(/^www\./, ''), text });
    console.log(`  ${pages.at(-1).name}: ${text.length} chars`);
  }

  // ── PASS 1: extract ───────────────────────────────────────────────────────────
  console.log('Extracting facts (pass 1/3)…');
  const facts = await extractFacts(pages, a.name, b.name);
  const priceClaims = (facts.claims ?? []).filter((c) => c.isPrice).length;
  console.log(`  ${facts.claims?.length ?? 0} claims, ${facts.conflicts?.length ?? 0} conflict(s), ${priceClaims} price claim(s) (excluded from the copy by rule)`);
  for (const c of facts.conflicts ?? []) console.log(`  ⚔ conflict: ${c.topic}`);
  writeFileSync(join(OUT_DIR, 'facts.json'), JSON.stringify(facts, null, 2));

  const links = {
    reviewA: `/reviews/${a.slug}/`, reviewB: `/reviews/${b.slug}/`,
    dealA: `/discounts/${a.slug}/`, dealB: `/discounts/${b.slug}/`,
    modelsA: `/live-sex/${a.slug}/`, modelsB: `/live-sex/${b.slug}/`,
  };

  // ── PASS 2: write ─────────────────────────────────────────────────────────────
  console.log('Writing the article (pass 2/3)…');
  const system = SYSTEM_PROMPT_TEMPLATE.replace(/\{\{SITE_A\}\}/g, a.name).replace(/\{\{SITE_B\}\}/g, b.name);
  const brief = JSON.stringify({
    verifiedFacts: facts,
    ourSites: [a, b].map((s) => ({
      name: s.name, shortDescription: s.shortDescription, included: s.included,
      ourReviewCopy: s.description, consolidatedFacts: s.externalContext, quotes: s.thirdPartyQuotes,
    })),
    linkTargets: links,
  });

  // Write, then REPAIR rather than fail: the mechanical rules (six links present, six widget
  // tokens, zero prices) are easy to satisfy and easy to forget — an early run dropped every
  // link. Handing the model its own violations back is far more reliable than re-rolling the
  // whole article and hoping, and it keeps the gates strict instead of being softened to pass.
  const MAX_ATTEMPTS = 3;
  let gen = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ask = attempt === 1
      ? brief
      : `${brief}\n\nYour previous draft broke these REQUIRED rules. Fix exactly these and return the whole JSON object again, keeping everything else:\n- ${draftProblems(gen, links, [a, b]).join('\n- ')}`;
    gen = await chat(system, ask);
    const problems = draftProblems(gen, links, [a, b]);
    if (problems.length === 0) break;
    console.log(`  attempt ${attempt}: ${problems.length} rule violation(s) — ${attempt < MAX_ATTEMPTS ? 'asking for a fix' : 'giving up'}`);
    for (const p of problems) console.log(`    · ${p}`);
    if (attempt === MAX_ATTEMPTS) throw new Error('draft still breaks the required rules after repairs — nothing written');
  }
  console.log(`  title: ${gen.title}`);
  console.log(`  body: ${gen.contentHtml.length} chars · ${gen.faqs.length} faqs · widgets + links + no-price checks OK`);
  const prose = figureless(gen.contentHtml).replace(/<[^>]+>/g, ' ');

  // ── PASS 3: verify against the extracted evidence ─────────────────────────────
  console.log('Verifying claims against the evidence (pass 3/3)…');
  const check = await verifyArticle(prose, facts, [a, b], a.name, b.name);
  writeFileSync(join(OUT_DIR, 'verification.json'), JSON.stringify(check, null, 2));
  const fail = [
    ...(check.unsupported ?? []).map((u) => `unsupported: "${u.sentence}" — ${u.why}`),
    ...(check.priceMentions ?? []).map((p) => `price mention: ${p}`),
    ...(check.misquotes ?? []).map((m) => `misquote: "${m.quote}" — ${m.why}`),
  ];
  if (fail.length) {
    console.error(`\nVerification found ${fail.length} problem(s):`);
    for (const f of fail) console.error(`  ✗ ${f}`);
    throw new Error('verification failed — nothing written. Re-run to regenerate, or tighten the prompt.');
  }
  console.log('  every claim traces to a source · no prices · quotes accurate');

  if (DRY_RUN) {
    console.log('\n── DRY RUN ─────────────────────────────────');
    console.log(`metaTitle: ${gen.metaTitle}`);
    console.log(`description: ${gen.description}`);
    console.log(`verdict: ${gen.verdict}`);
    console.log(`Facts + verification written to: ${OUT_DIR}`);
    console.log('No Strapi writes. Re-run without --dry-run to upload + publish.');
    return;
  }

  // ── Publish ───────────────────────────────────────────────────────────────────
  console.log('Uploading cover…');
  const coverName = `pornmode-${SLUG}-cover${extname(COVER) || '.png'}`;
  const mime = extname(COVER).toLowerCase() === '.jpg' || extname(COVER).toLowerCase() === '.jpeg' ? 'image/jpeg' : 'image/png';
  const coverUp = await uploadLocalFile(COVER, coverName, mime, 'image/');

  let body = gen.contentHtml
    .replace('{{DEAL_A}}', dealCard(a.documentId))
    .replace('{{DEAL_B}}', dealCard(b.documentId))
    .replace('{{MODELS_A}}', modelsButton(links.modelsA, `See who's live on ${a.name}`))
    .replace('{{MODELS_B}}', modelsButton(links.modelsB, `See who's live on ${b.name}`))
    .replace('{{PROS_CONS_A}}', prosCons(gen.prosConsA))
    .replace('{{PROS_CONS_B}}', prosCons(gen.prosConsB));

  const authorId = await resolveDocId('authors', AUTHOR_SLUG);
  if (!authorId) throw new Error(`author not found: ${AUTHOR_SLUG}`);
  const categoryId = await resolveDocId('categories', CATEGORY_SLUG);
  if (!categoryId) console.warn(`  ⚠ category not found: ${CATEGORY_SLUG} — publishing without a category badge`);
  const bySlug = await articlesBySlug();
  const existing = bySlug.get(SLUG);
  const maxPostId = Math.max(0, ...[...bySlug.values()].map((x) => Number(x.postId) || 0));

  const data = {
    metaTitle: gen.metaTitle,
    title: gen.title,
    slug: SLUG,
    postId: existing?.postId ?? maxPostId + 1,
    description: gen.description,
    content: body,
    coverImage: coverUp.id,
    author: authorId,
    publishDate: new Date().toISOString(),
    faqs: (gen.faqs ?? []).map((f) => ({ question: f.question, answer: f.answer })),
  };
  if (categoryId) data.categories = [categoryId];

  const saved = existing ? await updateArticle(existing.documentId, data) : await createArticle(data);
  await deleteOldMediaByName(coverName, coverUp.id);
  rmSync(OUT_DIR, { recursive: true, force: true });

  console.log(`\n${existing ? 'Updated' : 'Created'}: /blog/${data.postId}/${SLUG}/  (documentId ${saved.documentId ?? saved.data?.documentId})`);
  console.log('Promote with: node scripts/push-changed-content.mjs --only articles --apply');
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
