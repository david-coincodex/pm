#!/usr/bin/env node
/**
 * translate-messages.mjs
 *
 * Translates the next-intl UI message bundle (frontend/messages/en.json — the source of
 * truth) into a target locale, writing frontend/messages/<loc>.json. English is canonical:
 * every other locale is derived from it. Ported from CoinCodex's scripts/translate.ts and
 * adapted to next-intl (single-brace {placeholders} + ICU MessageFormat).
 *
 * Usage:
 *   node translate-messages.mjs --language de                 # incremental: fill missing/empty keys
 *   node translate-messages.mjs --language de --fresh         # REWRITE: retranslate everything
 *   node translate-messages.mjs --language de --scope reviews # one top-level namespace only
 *   node translate-messages.mjs --language de --key pageSEO.discount.metaTitle,reviews.pros
 *   node translate-messages.mjs --language de --key reviews.pros --fresh   # rewrite just those
 *   node translate-messages.mjs --language de --skip-seo      # everything EXCEPT the pageSEO namespace
 *   node translate-messages.mjs --language de --seo-only      # ONLY the pageSEO namespace
 *   node translate-messages.mjs --language de --batch         # OpenAI Batch API (~50% cheaper, async)
 *   node translate-messages.mjs --language de --dry-run       # print pending translations, no write
 *   node translate-messages.mjs --language de --reorder       # normalize/prune to match en, no API calls
 *   node translate-messages.mjs --language en --reorder       # prettify the English source
 *
 * Flags compose: --key/--scope/--skip-seo/--seo-only filter the work; --fresh forces rewrite of
 * the filtered subset; --batch/--dry-run/--reorder pick the execution mode.
 *
 * Environment (scripts/.env):
 *   OPENAI_API_KEY   OpenAI API key (or pass --token <key>)
 *   OPENAI_MODEL     override model (default gpt-5.5)
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import OpenAI from 'openai';

const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: `${__dirname}/.env` });

// ── Paths ────────────────────────────────────────────────────────────────────────
const MESSAGES_DIR = join(__dirname, '..', 'frontend', 'messages');
const CONTEXT_PATH = join(__dirname, 'translation-context.json');
const PREFERENCES_PATH = join(__dirname, 'translation-preferences.json');

// ── Do-not-translate glossary (kept English even mid-sentence) ──────────────────────
// Each token is given with its meaning so the model recognizes it; copied verbatim.
const DO_NOT_TRANSLATE = [
  { token: 'PornMode', meaning: 'the brand/site name (proper noun)' },
  { token: 'Adult Time', meaning: 'a partner network brand (proper noun)' },
  { token: 'LIVE', meaning: 'live-stream status badge — keep uppercase English' },
  { token: 'AI', meaning: 'artificial intelligence — kept as the English initialism' },
  { token: 'VR', meaning: 'virtual reality — kept as the English initialism' },
];
const DO_NOT_TRANSLATE_REGEX = new RegExp(
  '(' + DO_NOT_TRANSLATE.map(({ token }) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
  'g',
);

// ── Do-not-translate KEYS (whole values copied verbatim from English) ───────────────
// The platform.* payment-method entries are proper nouns (Visa, PayPal, TWINT, …). Only the
// four generic platform labels below are translated; everything else under platform.* is a brand.
const TRANSLATABLE_PLATFORM_KEYS = new Set(['sectionTitle', 'operatedBy', 'website', 'paymentMethods']);
function isDoNotTranslateKey(path) {
  if (path.startsWith('platform.')) {
    const leaf = path.slice('platform.'.length);
    return !TRANSLATABLE_PLATFORM_KEYS.has(leaf);
  }
  return false;
}

// ── Language display names (extend as locales are added) ─────────────────────────────
const LANGUAGE_NAMES = {
  de: 'German', it: 'Italian', es: 'Spanish', fr: 'French', pt: 'Portuguese',
  'pt-br': 'Brazilian Portuguese', nl: 'Dutch', pl: 'Polish', tr: 'Turkish',
  ru: 'Russian', sl: 'Slovenian', id: 'Indonesian', vi: 'Vietnamese', th: 'Thai',
};
const languageName = (loc) => LANGUAGE_NAMES[loc] || loc;

// ── Cost tracking (USD per 1M tokens; $ is an estimate) ──────────────────────────────
const PRICE = {
  'gpt-5.5': { in: Number(process.env.OPENAI_PRICE_GPT55_IN ?? 1.25), out: Number(process.env.OPENAI_PRICE_GPT55_OUT ?? 10) },
};
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const MAX_TOKENS = 8000;
const costOf = (usage, discount = 1) => {
  const p = PRICE[MODEL];
  if (!p || !usage) return 0;
  return ((usage.prompt_tokens || 0) * p.in + (usage.completion_tokens || 0) * p.out) / 1e6 * discount;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CLI ──────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flagValue(name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}
const language = flagValue('--language');
const freshMode = argv.includes('--fresh');
const dryRun = argv.includes('--dry-run');
const batchMode = argv.includes('--batch');
const reorderMode = argv.includes('--reorder');
const skipSeo = argv.includes('--skip-seo');
const seoOnly = argv.includes('--seo-only');
const scope = flagValue('--scope');
const keyArg = flagValue('--key');
const keyFilter = keyArg ? keyArg.split(',').map((k) => k.trim()).filter(Boolean) : null;
const token = flagValue('--token') || process.env.OPENAI_API_KEY;

if (!language) { console.error('Error: --language <loc> is required.'); process.exit(1); }
if (skipSeo && seoOnly) { console.error('Error: pass at most one of --skip-seo / --seo-only.'); process.exit(1); }
if (batchMode && dryRun) { console.error('Error: --batch and --dry-run are mutually exclusive.'); process.exit(1); }
if (!reorderMode && !token) { console.error('Error: OPENAI_API_KEY (or --token) is required.'); process.exit(1); }

const openai = !reorderMode ? new OpenAI({ apiKey: token }) : null;

// ── JSON helpers (plain objects preserve insertion order for non-integer keys) ───────
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'));

/** Flatten leaf string values to [{ path, value }] in document order. */
function flattenLeaves(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (isObject(v)) flattenLeaves(v, path, out);
    else if (typeof v === 'string') out.push({ path, value: v });
  }
  return out;
}
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (isObject(o) ? o[k] : undefined), obj);
}
function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isObject(o[parts[i]])) o[parts[i]] = {};
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = value;
}

// ── Filters ────────────────────────────────────────────────────────────────────────
function passesScopeFilters(path) {
  const top = path.split('.')[0];
  if (scope && top !== scope) return false;
  if (skipSeo && top === 'pageSEO') return false;
  if (seoOnly && top !== 'pageSEO') return false;
  if (keyFilter && !keyFilter.some((k) => path === k || path.startsWith(k + '.'))) return false;
  return true;
}

// ── Preserved-token fingerprint (placeholders + ICU + tags + glossary) ───────────────
// next-intl uses single-brace {var} and ICU MessageFormat. We must keep the *structure*
// (variable names, plural/select type, category labels, #) identical while letting the
// human-readable text inside ICU sub-messages change.
function fingerprint(str) {
  const tokens = [];
  let masked = '';      // string with ICU blocks / placeholders removed, so arm TEXT isn't
  let i = 0;            // mistaken for a placeholder (e.g. plural arm "{Day}" is literal text).
  while (i < str.length) {
    if (str[i] === '{') {
      let depth = 0, j = i;                                  // find the matching close brace
      for (; j < str.length; j++) {
        if (str[j] === '{') depth++;
        else if (str[j] === '}') { depth--; if (depth === 0) break; }
      }
      const block = str.slice(i, j + 1);
      const inner = block.slice(1, -1);
      const icu = inner.match(/^\s*(\w+)\s*,\s*(plural|select|selectordinal)\b/);
      const typed = inner.match(/^\s*(\w+)\s*,\s*(number|date|time|ordinal)\b/);
      if (icu) {
        tokens.push(`icu:${icu[1]}:${icu[2]}`);
        for (const m of block.matchAll(/(=\d+|\bzero\b|\bone\b|\btwo\b|\bfew\b|\bmany\b|\bother\b)\s*\{/g)) tokens.push(`cat:${m[1].trim()}`);
        for (const _ of block.matchAll(/#/g)) tokens.push('hash');     // pound = the count
      } else if (typed) {
        tokens.push(`arg:${typed[1]}:${typed[2]}`);          // {count, number} etc.
      } else if (/^\s*\w+\s*$/.test(inner)) {
        tokens.push(`var:${inner.trim()}`);                  // simple {name}
      } else {
        masked += block;                                     // unknown — keep for tag/glossary scan
      }
      i = j + 1;
      continue;
    }
    masked += str[i];
    i++;
  }
  for (const m of str.matchAll(/<\/?[a-zA-Z][^>]*>/g)) tokens.push(`tag:${m[0]}`);
  for (const m of str.match(DO_NOT_TRANSLATE_REGEX) || []) tokens.push(`kw:${m}`);
  return tokens.sort().join('||');
}

/** Validate a translated chunk: same leaf paths, same preserved-token fingerprint per leaf. */
function validateChunk(sourceObj, candidateObj) {
  const src = flattenLeaves(sourceObj);
  const cand = flattenLeaves(candidateObj);
  const candMap = new Map(cand.map((l) => [l.path, l.value]));
  for (const { path, value } of src) {
    if (!candMap.has(path)) throw new Error(`missing key ${path}`);
    if (fingerprint(value) !== fingerprint(candMap.get(path))) {
      throw new Error(`preserved tokens changed for ${path}`);
    }
  }
  if (cand.length !== src.length) throw new Error(`leaf count changed (${src.length} → ${cand.length})`);
}

// ── Prompt building ──────────────────────────────────────────────────────────────
const annotations = existsSync(CONTEXT_PATH) ? (readJson(CONTEXT_PATH).annotations || {}) : {};
const preferences = existsSync(PREFERENCES_PATH) ? readJson(PREFERENCES_PATH) : {};

function buildSystemPrompt(strict) {
  const dnt = DO_NOT_TRANSLATE.map(({ token, meaning }) => `${token} (${meaning})`).join(', ');
  const preferred = preferences[language] || [];
  const preferredClause = preferred.length
    ? ` Use the team's preferred wording for these terms, adapting each to the correct grammatical form for its context (do not copy verbatim if the sentence needs a different case/inflection): ${preferred
        .map(({ en, preferred }) => `"${en}" -> "${preferred}"`).join(', ')}.`
    : '';
  const base = `You translate PornMode (an adult-site deals directory) UI strings from English to ${languageName(language)} (${language}). Return only a valid JSON object with the EXACT same shape and keys as the input — translate only the string VALUES, never the keys. Keep single-brace placeholders like {name} or {count} unchanged. For ICU MessageFormat (e.g. {count, plural, one {# site} other {# sites}}) keep the structure exactly — the variable name, the words plural/select/selectordinal, the category labels (one, other, =0, …) and the # symbol — and translate ONLY the human-readable text inside each sub-message. Preserve any HTML/markup tags exactly. Never translate these tokens — copy them exactly wherever they appear, even inside a sentence: ${dnt}.${preferredClause}`;
  return strict
    ? `${base} CRITICAL: every {placeholder}, ICU structure token and tag must appear in your output exactly as in the source — same spelling, same count. Do not add, remove, reorder, or translate them.`
    : base;
}

function buildContextLines(chunkObj) {
  return flattenLeaves(chunkObj)
    .map(({ path }) => `${path}: ${annotations[path] || 'No annotation available.'}`)
    .join('\n');
}
function buildUserPrompt(chunkObj) {
  return `Context for these keys:\n${buildContextLines(chunkObj)}\n\nTranslate this JSON object:\n${JSON.stringify(chunkObj, null, 2)}`;
}

// ── Pending work: which leaves to translate, grouped into per-namespace chunks ───────
const enPath = join(MESSAGES_DIR, 'en.json');
const targetPath = join(MESSAGES_DIR, `${language}.json`);
if (!existsSync(enPath)) { console.error(`Error: ${enPath} not found.`); process.exit(1); }
const en = readJson(enPath);
const existing = existsSync(targetPath) ? readJson(targetPath) : {};

const allLeaves = flattenLeaves(en);
const pendingPaths = new Set();
for (const { path, value } of allLeaves) {
  if (!passesScopeFilters(path)) continue;
  if (isDoNotTranslateKey(path)) continue;          // copied verbatim, never sent to the model
  const cur = getPath(existing, path);
  const missing = typeof cur !== 'string' || cur.trim() === '';
  if (freshMode || missing) pendingPaths.add(path);
}

/** Build per-namespace chunk objects containing ONLY the pending leaves (English values),
 *  each wrapped under its namespace so paths stay global for context + validation. */
function buildPendingChunks() {
  const byNs = new Map();
  for (const path of pendingPaths) {
    const parts = path.split('.');
    const ns = parts[0];
    const rel = parts.slice(1).join('.');
    if (!byNs.has(ns)) byNs.set(ns, {});
    setPath(byNs.get(ns), rel, getPath(en, path));
  }
  return [...byNs.entries()].map(([ns, sub]) => ({ ns, obj: { [ns]: sub } }));
}

// ── Output assembly ──────────────────────────────────────────────────────────────
const translated = new Map();   // global path -> translated string
const failedPaths = new Set();  // paths whose chunk failed validation (fall back to English)

/** Build the final locale object from the English structure (guarantees order + orphan pruning). */
function assembleOutput() {
  const build = (node, prefix) => {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (isObject(v)) {
        out[k] = build(v, path);
      } else if (typeof v === 'string') {
        if (reorderMode) {
          const cur = getPath(existing, path);
          if (typeof cur === 'string' && cur.trim() !== '') out[k] = cur;   // normalize only; omit missing
        } else if (translated.has(path)) {
          out[k] = translated.get(path);                                    // freshly translated this run
        } else {
          // Never overwrite an existing translation the script didn't just produce.
          const cur = getPath(existing, path);
          if (typeof cur === 'string' && cur.trim() !== '') out[k] = cur;   // preserve existing (incl. localized brands)
          else if (isDoNotTranslateKey(path)) out[k] = v;                   // brand with no translation → English verbatim
          // else: untranslated & out of scope → OMIT so a future unfiltered run still picks it up
          //       (next-intl falls back to English at runtime).
        }
      }
    }
    return out;
  };
  return build(en, '');
}

function serialize(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}
function writeIfChanged(obj) {
  const next = serialize(obj);
  const prev = existsSync(targetPath) ? readFileSync(targetPath, 'utf-8') : '';
  if (next === prev) { console.log(`No changes — ${language}.json already up to date.`); return false; }
  writeFileSync(targetPath, next);
  console.log(`✓ Wrote frontend/messages/${language}.json`);
  return true;
}

// ── Translation (sync) ─────────────────────────────────────────────────────────────
async function translateChunkSync(chunk, strict = false) {
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt(strict) },
      { role: 'user', content: buildUserPrompt(chunk.obj) },
    ],
    max_completion_tokens: MAX_TOKENS,
    response_format: { type: 'json_object' },
  });
  const raw = res.choices[0]?.message?.content;
  if (!raw) throw new Error(`empty response (finish_reason: ${res.choices[0]?.finish_reason})`);
  return { parsed: JSON.parse(raw), usage: res.usage };
}

function recordTranslation(chunk, parsed) {
  validateChunk(chunk.obj, parsed);
  for (const { path, value } of flattenLeaves(parsed)) translated.set(path, value);
}

async function runSync(chunks) {
  let cost = 0;
  for (const chunk of chunks) {
    process.stdout.write(`  🌐 ${chunk.ns} (${flattenLeaves(chunk.obj).length} keys)… `);
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const { parsed, usage } = await translateChunkSync(chunk, attempt > 0);
        cost += costOf(usage);
        recordTranslation(chunk, parsed);
        ok = true;
      } catch (e) {
        if (attempt === 2) {
          console.log(`✗ ${e.message} — falling back to English for this namespace`);
          for (const { path } of flattenLeaves(chunk.obj)) failedPaths.add(path);
        }
      }
    }
    if (ok) console.log('✓');
    await sleep(500);
  }
  return cost;
}

// ── Translation (batch — OpenAI Batch API, ~50% cheaper) ────────────────────────────
async function runBatch(chunks) {
  const lines = chunks.map((c) => JSON.stringify({
    custom_id: c.ns,
    method: 'POST',
    url: '/v1/chat/completions',
    body: {
      model: MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(false) },
        { role: 'user', content: buildUserPrompt(c.obj) },
      ],
      max_completion_tokens: MAX_TOKENS,
      response_format: { type: 'json_object' },
    },
  }));
  console.log(`Submitting batch: ${chunks.length} namespace chunk(s)…`);
  const inputFile = await openai.files.create({
    file: new File([lines.join('\n') + '\n'], 'translate-batch.jsonl', { type: 'application/jsonl' }),
    purpose: 'batch',
  });
  let batch = await openai.batches.create({ input_file_id: inputFile.id, endpoint: '/v1/chat/completions', completion_window: '24h' });
  console.log(`  batch id: ${batch.id} — polling (safe to leave running)`);
  const DONE = ['completed', 'failed', 'expired', 'cancelled'];
  while (!DONE.includes(batch.status)) {
    await sleep(15000);
    batch = await openai.batches.retrieve(batch.id);
    const c = batch.request_counts || {};
    console.log(`  status: ${batch.status} — ${c.completed || 0}/${c.total || 0}${c.failed ? `, ${c.failed} failed` : ''}`);
  }
  if (!batch.output_file_id) { console.error(`Batch ${batch.status}, no output.`); return { cost: 0, retry: chunks }; }

  const out = await (await openai.files.content(batch.output_file_id)).text();
  const byId = new Map();
  for (const line of out.trim().split('\n')) { if (line) { const o = JSON.parse(line); byId.set(o.custom_id, o); } }

  let cost = 0;
  const retry = [];
  for (const chunk of chunks) {
    const o = byId.get(chunk.ns);
    try {
      if (!o || o.error || o.response?.status_code >= 300) throw new Error(o?.error?.message || 'no/failed response');
      const body = o.response.body;
      cost += costOf(body.usage, 0.5);
      recordTranslation(chunk, JSON.parse(body.choices[0].message.content));
      console.log(`  ✓ ${chunk.ns}`);
    } catch (e) {
      console.log(`  ↻ ${chunk.ns}: ${e.message} — will retry synchronously (strict)`);
      retry.push(chunk);
    }
  }
  return { cost, retry };
}

// ── Main ───────────────────────────────────────────────────────────────────────────
async function main() {
  if (reorderMode) {
    const out = assembleOutput();
    if (dryRun) {
      const next = serialize(out);
      const prev = existsSync(targetPath) ? readFileSync(targetPath, 'utf-8') : '';
      console.log(next === prev
        ? `Reorder dry-run: ${language}.json already normalized (no changes).`
        : `Reorder dry-run: ${language}.json would be rewritten to match en.json order/pruning.`);
      return;
    }
    console.log(`Reordering ${language}.json to match en.json (no API calls)…`);
    writeIfChanged(out);
    return;
  }

  const chunks = buildPendingChunks();
  const pendingCount = pendingPaths.size;
  console.log(`Locale: ${language} (${languageName(language)}) | model: ${MODEL}`);
  console.log(`Pending keys: ${pendingCount} across ${chunks.length} namespace(s)${freshMode ? ' [--fresh]' : ''}` +
    `${scope ? ` [scope=${scope}]` : ''}${skipSeo ? ' [skip-seo]' : ''}${seoOnly ? ' [seo-only]' : ''}` +
    `${keyFilter ? ` [keys=${keyFilter.length}]` : ''}`);

  if (pendingCount === 0) {
    console.log('Nothing to translate. (Use --fresh to rewrite, or --reorder to normalize.)');
    // Still normalize order/orphans so the file stays clean.
    writeIfChanged(assembleOutput());
    return;
  }

  if (dryRun) {
    let cost = 0;
    for (const chunk of chunks) {
      try {
        const { parsed, usage } = await translateChunkSync(chunk);
        cost += costOf(usage);
        validateChunk(chunk.obj, parsed);
        console.log(`\n── ${chunk.ns} ──\n${JSON.stringify(parsed, null, 2)}`);
      } catch (e) { console.log(`\n── ${chunk.ns} ── ✗ ${e.message}`); }
    }
    console.log(`\nMode: dry-run (no writes). Estimated cost: $${cost.toFixed(4)}`);
    return;
  }

  let cost = 0;
  if (batchMode) {
    const { cost: bc, retry } = await runBatch(chunks);
    cost += bc;
    if (retry.length) cost += await runSync(retry);   // strict synchronous retry for failures
  } else {
    cost += await runSync(chunks);
  }

  writeIfChanged(assembleOutput());
  if (failedPaths.size) console.log(`⚠ ${failedPaths.size} key(s) fell back to English (validation failed).`);
  console.log(`Estimated OpenAI cost: $${cost.toFixed(4)}${batchMode ? ' (batch ≈50% off)' : ''}`);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
