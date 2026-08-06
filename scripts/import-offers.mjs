#!/usr/bin/env node
/**
 * import-offers.mjs
 *
 * Populates the `offers` collection from the pricing spreadsheet (one row per offer).
 * See import-offers.md for the table format and the column contract.
 *
 * Idempotent by design: an offer is identified by (site, offerKind, offerType, credits). A re-run
 * PUTs changed prices/links onto the existing rows instead of creating duplicates, so this is the
 * normal way to push a price change — not just a one-time seed.
 *
 * Usage:
 *   node scripts/import-offers.mjs                       # dry run against the live sheet
 *   node scripts/import-offers.mjs --apply
 *   node scripts/import-offers.mjs --csv ./offers.csv    # use a local export instead
 *   node scripts/import-offers.mjs --apply --prune       # also deactivate offers the sheet dropped
 *
 * Options:
 *   --apply     Write to Strapi (omit to preview)
 *   --csv <p>   Read a local CSV instead of fetching the sheet
 *   --sheet <id>  Override the spreadsheet id
 *   --gid <n>   Override the sheet tab gid (default 0)
 *   --prune     Set isActive=false on existing offers that are no longer in the sheet
 *
 * Environment: STRAPI_URL, STRAPI_TOKEN (scripts/.env)
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const _require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
_require('dotenv').config({ path: `${__dirname}/.env`, quiet: true });

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;
if (!TOKEN) { console.error('Error: STRAPI_TOKEN is required (scripts/.env).'); process.exit(1); }
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  const next = argv[i + 1];
  return i !== -1 && next && !next.startsWith('--') ? next : fallback;
};
const APPLY = has('--apply');
const PRUNE = has('--prune');
const CSV_PATH = flag('--csv', null);
const SHEET_ID = flag('--sheet', '11xvoXDz77-w0zYY986bH67KKaYeJ7GJmJfKajdoYTSQ');
const GID = flag('--gid', '0');

// ── Column contract ───────────────────────────────────────────────────────────
// site, offerKind, offerType, <unused>, price, full_price, allowDownloads, affiliateLink
const COL = { site: 0, offerKind: 1, offerType: 2, price: 4, fullPrice: 5, allowDownloads: 6, link: 7 };

/** Sheet display names that differ from our catalog naming. Keys are normalised (a-z0-9). */
const ALIASES = {
  kinkcom: 'kink',
  thaiswingers: 'thai-swinger',
};

/** offerType values the schema accepts for a subscription. Anything else is rejected, not guessed. */
const SUBSCRIPTION_TYPES = new Set(['trial', 'monthly', 'quarterly', 'yearly', 'lifetime']);

const K = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * CSV field splitter that honours double-quoted fields.
 *
 * Not optional: affiliate URLs contain commas (".../track/ABC,18"), so a naive split(',')
 * silently shifts every later column — it reads the link as empty and the row looks broken.
 */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

async function loadCsv() {
  if (CSV_PATH) return readFileSync(CSV_PATH, 'utf-8');
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`sheet fetch failed: ${res.status} (is it shared as "anyone with the link"?)`);
  return res.text();
}

// ── Strapi ────────────────────────────────────────────────────────────────────
async function api(path) {
  const res = await fetch(`${STRAPI_URL}/api${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function fetchAllSites() {
  const out = [];
  for (let page = 1; ; page += 1) {
    const { data, meta } = await api(
      `/sites?fields[0]=name&fields[1]=slug&pagination[page]=${page}&pagination[pageSize]=100`,
    );
    out.push(...data);
    if (page >= (meta?.pagination?.pageCount ?? 1)) break;
  }
  return out;
}

async function fetchAllOffers() {
  const out = [];
  for (let page = 1; ; page += 1) {
    const { data, meta } = await api(
      `/offers?populate[site][fields][0]=slug&pagination[page]=${page}&pagination[pageSize]=100`,
    );
    out.push(...data);
    if (page >= (meta?.pagination?.pageCount ?? 1)) break;
  }
  return out;
}

async function write(method, path, data, label) {
  const res = await fetch(`${STRAPI_URL}/api${path}`, { method, headers, body: JSON.stringify({ data }) });
  if (!res.ok) throw new Error(`${label}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).data;
}

// ── Row -> offer ──────────────────────────────────────────────────────────────
const num = (v) => {
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * Map one sheet row onto offer fields, or explain why it cannot be mapped.
 *
 * The one non-obvious transform: for credit packs the sheet puts the pack SIZE in the offerType
 * column ("550"), but the schema's offerType is an enum. So size moves to the integer `credits`
 * field and offerType becomes the literal 'credits' — which is exactly what the UI reads to render
 * "550 credits — $49.99".
 */
function toOffer(cells, siteBySlug, lineNo) {
  const siteName = (cells[COL.site] ?? '').trim();
  if (!siteName) return { skip: 'blank site' };

  const key = K(siteName);
  const site = siteBySlug.get(key) ?? siteBySlug.get(K(ALIASES[key] ?? ''));
  if (!site) return { skip: `unknown site "${siteName}"` };

  const kind = (cells[COL.offerKind] ?? '').trim().toLowerCase();
  if (kind !== 'subscription' && kind !== 'credits') return { skip: `offerKind must be subscription|credits, got "${kind}"` };

  const rawType = (cells[COL.offerType] ?? '').trim().toLowerCase();
  const price = num(cells[COL.price]);
  const fullPrice = num(cells[COL.fullPrice]);
  const link = (cells[COL.link] ?? '').trim();

  if (price === null) return { skip: 'missing price' };
  // affiliateLink is required by the schema, and an offer without one renders a dead buy button.
  if (!/^https?:\/\//i.test(link)) return { skip: 'missing/invalid affiliateLink' };

  let offerType;
  let credits = null;
  if (kind === 'credits') {
    credits = num(rawType);
    if (credits === null || credits <= 0) return { skip: `credits row needs a pack size in offerType, got "${rawType}"` };
    offerType = 'credits';
  } else {
    if (!SUBSCRIPTION_TYPES.has(rawType)) {
      return { skip: `offerType "${rawType}" is not one of ${[...SUBSCRIPTION_TYPES].join('/')}` };
    }
    offerType = rawType;
  }

  const dl = (cells[COL.allowDownloads] ?? '').trim().toLowerCase();

  return {
    line: lineNo,
    siteSlug: site.slug,
    siteName: site.name,
    data: {
      site: site.documentId,
      offerKind: kind,
      offerType,
      ...(credits !== null ? { credits } : {}),
      price,
      ...(fullPrice !== null ? { full_price: fullPrice } : {}),
      affiliateLink: link,
      allowsDownloads: dl === 'yes' || dl === 'true',
      isActive: true,
    },
  };
}

/** Identity of an offer, for matching sheet rows to existing rows. */
const identity = (siteSlug, d) => `${siteSlug}|${d.offerKind}|${d.offerType}|${d.credits ?? ''}`;

// ── Main ──────────────────────────────────────────────────────────────────────
const csv = await loadCsv();
const lines = csv.trim().split('\n');
const sites = await fetchAllSites();
const siteBySlug = new Map();
for (const s of sites) { siteBySlug.set(K(s.slug), s); siteBySlug.set(K(s.name), s); }

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${STRAPI_URL} | ${lines.length - 1} sheet rows | ${sites.length} sites\n`);

const parsed = [];
const skipped = [];
const seen = new Map();
lines.slice(1).forEach((line, i) => {
  if (!line.trim()) return;
  const r = toOffer(splitCsvLine(line), siteBySlug, i + 2);
  if (r.skip) { skipped.push({ line: i + 2, raw: line.slice(0, 60), why: r.skip }); return; }
  const id = identity(r.siteSlug, r.data);
  if (seen.has(id)) { skipped.push({ line: r.line, raw: r.siteName, why: `duplicate of line ${seen.get(id)}` }); return; }
  seen.set(id, r.line);
  parsed.push(r);
});

const existing = await fetchAllOffers();
const byIdentity = new Map(
  existing.filter((o) => o.site?.slug).map((o) => [identity(o.site.slug, o), o]),
);

const creates = [], updates = [], unchanged = [];
for (const r of parsed) {
  const hit = byIdentity.get(identity(r.siteSlug, r.data));
  if (!hit) { creates.push(r); continue; }
  const differs =
    Number(hit.price) !== r.data.price ||
    Number(hit.full_price ?? 0) !== (r.data.full_price ?? 0) ||
    hit.affiliateLink !== r.data.affiliateLink ||
    !!hit.allowsDownloads !== r.data.allowsDownloads ||
    hit.isActive !== true;
  (differs ? updates : unchanged).push({ ...r, documentId: hit.documentId });
}

const sheetIds = new Set(parsed.map((r) => identity(r.siteSlug, r.data)));
const orphans = existing.filter((o) => o.site?.slug && !sheetIds.has(identity(o.site.slug, o)) && o.isActive);

console.log(`create: ${creates.length} | update: ${updates.length} | unchanged: ${unchanged.length} | skipped: ${skipped.length}`);
if (orphans.length) console.log(`active offers not in sheet: ${orphans.length}${PRUNE ? ' (will be deactivated)' : ' (use --prune to deactivate)'}`);

if (skipped.length) {
  console.log(`\n=== SKIPPED ROWS ===`);
  skipped.forEach((s) => console.log(`  line ${s.line}: ${s.why}  [${s.raw}]`));
}

// Anything a human should eyeball before this becomes live pricing. These are warnings, never
// auto-corrections: the sheet is the source of truth, so a wrong figure gets reported and left
// alone. Fix it in the sheet and re-run — the update path is idempotent.
const zeroPrice = parsed.filter((r) => r.data.price === 0);
const noFull = parsed.filter((r) => r.data.full_price === undefined);
const inverted = parsed.filter((r) => r.data.full_price !== undefined && r.data.full_price < r.data.price);

/**
 * Yearly full_price that dwarfs the same site's monthly full_price.
 *
 * Catches the double-annualisation slip: monthly full x12 is the yearly full, but multiplying the
 * *already annual* figure by 12 again passes every other check — it is a valid number, above the
 * sale price, and yields a plausible-looking discount badge. Only the magnitude gives it away.
 * (Mofos shipped as $4318.56 instead of $359.88 this way.)
 */
const monthlyFullBySite = new Map(
  parsed.filter((r) => r.data.offerType === 'monthly' && r.data.full_price).map((r) => [r.siteSlug, r.data.full_price]),
);
const overAnnualised = parsed.filter((r) => {
  if (r.data.offerType !== 'yearly' || !r.data.full_price) return false;
  const monthly = monthlyFullBySite.get(r.siteSlug);
  return monthly && r.data.full_price > monthly * 15;
});

if (zeroPrice.length || noFull.length || inverted.length || overAnnualised.length) {
  console.log(`\n=== WORTH A LOOK (imported as-is) ===`);
  zeroPrice.forEach((r) => console.log(`  line ${r.line}: ${r.siteName} price is 0 — renders as 100% off`));
  noFull.forEach((r) => console.log(`  line ${r.line}: ${r.siteName} ${r.data.offerType} has no full_price — no discount % will show`));
  inverted.forEach((r) => console.log(`  line ${r.line}: ${r.siteName} full_price < price — discount would be negative`));
  overAnnualised.forEach((r) => {
    const monthly = monthlyFullBySite.get(r.siteSlug);
    console.log(
      `  line ${r.line}: ${r.siteName} yearly full_price $${r.data.full_price} is >15x its monthly full ($${monthly}) — ` +
        `annualised twice? $${(monthly * 12).toFixed(2)} looks intended`,
    );
  });
}

if (!APPLY) {
  console.log(`\n=== WOULD CREATE ===`);
  for (const r of creates) {
    const label = r.data.offerKind === 'credits' ? `${r.data.credits} credits` : r.data.offerType;
    console.log(`  ${r.siteName.padEnd(20)} ${String(label).padEnd(14)} $${r.data.price}${r.data.full_price ? ` (was $${r.data.full_price})` : ''}`);
  }
  if (updates.length) {
    console.log(`\n=== WOULD UPDATE ===`);
    updates.forEach((r) => console.log(`  ${r.siteName} ${r.data.offerType}`));
  }
  console.log(`\nDry run — re-run with --apply to write.`);
  process.exit(0);
}

let created = 0, updated = 0, pruned = 0, failed = 0;
for (const r of creates) {
  try { await write('POST', '/offers', r.data, `create ${r.siteSlug}`); created += 1; }
  catch (e) { console.log(`! line ${r.line} ${r.siteName}: ${e.message}`); failed += 1; }
}
for (const r of updates) {
  try { await write('PUT', `/offers/${r.documentId}`, r.data, `update ${r.siteSlug}`); updated += 1; }
  catch (e) { console.log(`! line ${r.line} ${r.siteName}: ${e.message}`); failed += 1; }
}
if (PRUNE) {
  for (const o of orphans) {
    try { await write('PUT', `/offers/${o.documentId}`, { isActive: false }, `prune ${o.site.slug}`); pruned += 1; }
    catch (e) { console.log(`! prune ${o.site.slug}: ${e.message}`); failed += 1; }
  }
}

console.log(`\nDone — created ${created}, updated ${updated}, unchanged ${unchanged.length}${PRUNE ? `, deactivated ${pruned}` : ''}, failed ${failed}.`);
if (created || updated || pruned) console.log('Bust the frontend cache: POST /api/revalidate (or wait for the Strapi webhook).');
