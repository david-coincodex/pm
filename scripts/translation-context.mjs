#!/usr/bin/env node
/**
 * translation-context.mjs
 *
 * Generates a one-line context annotation per translation key, stored in
 * scripts/translation-context.json (English-keyed, language-independent). The translator
 * (translate-messages.mjs) feeds these annotations to the model so short UI labels are
 * translated with the right intent. Ported from CoinCodex's scripts/translation-context.ts.
 *
 * The context is keyed by the GLOBAL key path in frontend/messages/en.json (e.g.
 * "pageSEO.discount.metaTitle"). Always refresh context after changing English keys: any new
 * key has no annotation until generated, which yields weaker translations.
 *
 * Usage:
 *   node translation-context.mjs --check                 # how many keys lack context?
 *   node translation-context.mjs --generate              # NEW KEYS ONLY: fill missing entries (GPT)
 *   node translation-context.mjs --generate --batch       # via OpenAI Batch API (~50% cheaper)
 *   node translation-context.mjs --refresh                # REWRITE every annotation
 *   node translation-context.mjs --refresh --scope reviews        # rewrite one namespace
 *   node translation-context.mjs --refresh --key reviews.pros     # rewrite one key
 *   node translation-context.mjs --generate --skip-seo    # skip the pageSEO namespace
 *
 * Removed/renamed keys: delete their entry by hand — this script does not prune orphans.
 *
 * Environment (scripts/.env): OPENAI_API_KEY (or --token), OPENAI_MODEL (default gpt-5.5)
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import OpenAI from 'openai';

const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: `${__dirname}/.env`, quiet: true });

const MESSAGES_DIR = join(__dirname, '..', 'frontend', 'messages');
const SRC_DIR = join(__dirname, '..', 'frontend', 'src');
const CONTEXT_PATH = join(__dirname, 'translation-context.json');

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const MAX_TOKENS = 8000;
const GROUP_SIZE = 40;                 // keys per GPT request
const PRICE = { 'gpt-5.5': { in: 1.25, out: 10 } };
const costOf = (usage, discount = 1) => {
  const p = PRICE[MODEL];
  if (!p || !usage) return 0;
  return ((usage.prompt_tokens || 0) * p.in + (usage.completion_tokens || 0) * p.out) / 1e6 * discount;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CLI ──────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flagValue = (name) => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined; };
const checkMode = argv.includes('--check');
const generateMode = argv.includes('--generate');
const refreshMode = argv.includes('--refresh');
const batchMode = argv.includes('--batch');
const skipSeo = argv.includes('--skip-seo');
const seoOnly = argv.includes('--seo-only');
const scope = flagValue('--scope');
const keyArg = flagValue('--key');
const keyFilter = keyArg ? keyArg.split(',').map((k) => k.trim()).filter(Boolean) : null;
const token = flagValue('--token') || process.env.OPENAI_API_KEY;

if (!checkMode && !generateMode && !refreshMode) {
  console.error('Usage: node translation-context.mjs (--check | --generate | --refresh) [--batch] [--scope <ns>] [--key <a,b>] [--skip-seo|--seo-only]');
  process.exit(1);
}
if (skipSeo && seoOnly) { console.error('Error: pass at most one of --skip-seo / --seo-only.'); process.exit(1); }
if ((generateMode || refreshMode) && !token) { console.error('Error: OPENAI_API_KEY (or --token) is required.'); process.exit(1); }
const openai = (generateMode || refreshMode) ? new OpenAI({ apiKey: token }) : null;

// ── Keys ───────────────────────────────────────────────────────────────────────────
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'));
function flattenLeaves(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (isObject(v)) flattenLeaves(v, path, out);
    else if (typeof v === 'string') out.push({ path, value: v });
  }
  return out;
}
// Verbatim platform.* payment-brand keys are never translated, so they need no context
// (mirrors translate-messages.mjs). Only the four generic platform labels get annotated.
const TRANSLATABLE_PLATFORM_KEYS = new Set(['sectionTitle', 'operatedBy', 'website', 'paymentMethods']);
function isDoNotTranslateKey(path) {
  return path.startsWith('platform.') && !TRANSLATABLE_PLATFORM_KEYS.has(path.slice('platform.'.length));
}
function passesFilters(path) {
  const top = path.split('.')[0];
  if (isDoNotTranslateKey(path)) return false;
  if (scope && top !== scope) return false;
  if (skipSeo && top === 'pageSEO') return false;
  if (seoOnly && top !== 'pageSEO') return false;
  if (keyFilter && !keyFilter.some((k) => path === k || path.startsWith(k + '.'))) return false;
  return true;
}

const en = readJson(join(MESSAGES_DIR, 'en.json'));
const leaves = flattenLeaves(en).filter((l) => passesFilters(l.path));

// ── Code context extraction ──────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) { if (name !== 'node_modules') walk(full, out); }
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const SRC_FILES = existsSync(SRC_DIR) ? walk(SRC_DIR).map((f) => ({ f, lines: readFileSync(f, 'utf-8').split('\n') })) : [];

/** Code snippets where the key is referenced. next-intl t() calls use the path WITHOUT the
 *  top-level namespace (the namespace is bound on the translator), so search for that. */
function codeContextFor(path) {
  const rel = path.split('.').slice(1).join('.') || path;      // e.g. "discount.metaTitle", "pros"
  const needles = [`'${rel}'`, `"${rel}"`];
  const snippets = [];
  for (const { f, lines } of SRC_FILES) {
    for (let i = 0; i < lines.length && snippets.length < 2; i++) {
      if (needles.some((n) => lines[i].includes(n))) {
        const from = Math.max(0, i - 2), to = Math.min(lines.length, i + 2);
        snippets.push(`// ${f.split('/frontend/')[1]}\n${lines.slice(from, to).join('\n')}`);
      }
    }
    if (snippets.length >= 2) break;
  }
  return snippets.join('\n---\n').slice(0, 800);
}

// ── Existing context ─────────────────────────────────────────────────────────────
const existing = existsSync(CONTEXT_PATH) ? readJson(CONTEXT_PATH) : { _meta: {}, annotations: {} };
const annotations = existing.annotations || {};

// Target keys for this run.
const targets = leaves.filter((l) => (refreshMode ? true : !annotations[l.path]));

// ── --check ──────────────────────────────────────────────────────────────────────
if (checkMode) {
  const missing = leaves.filter((l) => !annotations[l.path]);
  console.log(`Keys in scope: ${leaves.length} | with context: ${leaves.length - missing.length} | missing: ${missing.length}`);
  if (missing.length) {
    console.log('Missing:');
    for (const m of missing.slice(0, 50)) console.log(`  ${m.path}`);
    if (missing.length > 50) console.log(`  …and ${missing.length - 50} more`);
    console.log(missing.length ? '\nRun: node translation-context.mjs --generate' : '');
  } else {
    console.log('Context complete ✓');
  }
  process.exit(0);
}

// ── Prompt building ──────────────────────────────────────────────────────────────
const truncate = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
function buildPrompt(items) {
  return `You are analyzing "PornMode", an adult-site deals/discounts directory (Next.js + next-intl), to write translation-context annotations.

For each translation key I give the full key path, the English value, and code context showing where it is used. Write a concise ONE-sentence annotation per key describing what UI element it is, its purpose/placement, and any disambiguation a translator needs (e.g. button vs heading vs SEO meta tag). The "pageSEO.*" keys are SEO meta titles/descriptions and on-page hero titles/subtitles.

Return ONLY a valid JSON object mapping each full key path to its annotation string.

Keys to annotate:

${items.map(({ path, value }) => `--- ${path} ---\nEN: "${truncate(value, 300)}"\n${codeContextFor(path) || '(no code usage found)'}\n`).join('\n')}`;
}
function requestBody(items) {
  return {
    model: MODEL,
    max_completion_tokens: MAX_TOKENS,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You are an expert at reading code to write translation context. Return only valid JSON.' },
      { role: 'user', content: buildPrompt(items) },
    ],
  };
}
function chunkArray(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

// ── Write ──────────────────────────────────────────────────────────────────────────
function save() {
  const ordered = {};
  for (const { path } of flattenLeaves(en)) if (annotations[path]) ordered[path] = annotations[path];
  const out = {
    _meta: { generated: new Date().toISOString(), model: MODEL, totalKeys: Object.keys(ordered).length },
    annotations: ordered,
  };
  writeFileSync(CONTEXT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`✓ Wrote scripts/translation-context.json (${out._meta.totalKeys} annotations)`);
}

// ── Main ───────────────────────────────────────────────────────────────────────────
async function main() {
  if (targets.length === 0) {
    console.log(refreshMode ? 'No keys in scope to refresh.' : 'No missing keys — context already complete. (Use --refresh to rewrite.)');
    return;
  }
  console.log(`${refreshMode ? 'Refreshing' : 'Generating'} context for ${targets.length} key(s) | model: ${MODEL}`);
  const groups = chunkArray(targets, GROUP_SIZE);
  let cost = 0;

  if (batchMode) {
    const lines = groups.map((g, i) => JSON.stringify({ custom_id: `g${i}`, method: 'POST', url: '/v1/chat/completions', body: requestBody(g) }));
    console.log(`Submitting batch: ${groups.length} group(s)…`);
    const inputFile = await openai.files.create({
      file: new File([lines.join('\n') + '\n'], 'context-batch.jsonl', { type: 'application/jsonl' }),
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
    if (!batch.output_file_id) { console.error(`Batch ${batch.status}, no output.`); return; }
    const out = await (await openai.files.content(batch.output_file_id)).text();
    for (const line of out.trim().split('\n')) {
      if (!line) continue;
      const o = JSON.parse(line);
      if (o.error || o.response?.status_code >= 300) { console.log(`  ✗ ${o.custom_id}: failed`); continue; }
      const body = o.response.body;
      cost += costOf(body.usage, 0.5);
      const parsed = JSON.parse(body.choices[0].message.content);
      for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') annotations[k] = v;
    }
  } else {
    for (let i = 0; i < groups.length; i++) {
      process.stdout.write(`  group ${i + 1}/${groups.length}… `);
      try {
        const res = await openai.chat.completions.create(requestBody(groups[i]));
        cost += costOf(res.usage);
        const parsed = JSON.parse(res.choices[0].message.content);
        let n = 0;
        for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') { annotations[k] = v; n++; }
        console.log(`✓ ${n}`);
      } catch (e) { console.log(`✗ ${e.message}`); }
      await sleep(500);
    }
  }

  save();
  console.log(`Estimated OpenAI cost: $${cost.toFixed(4)}${batchMode ? ' (batch ≈50% off)' : ''}`);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
