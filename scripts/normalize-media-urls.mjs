#!/usr/bin/env node
/**
 * normalize-media-urls.mjs
 *
 * Enforces the invariant that Strapi stores uploaded-media URLs as root-relative `/uploads/...`
 * paths, with the domain added only at render time.
 *
 * ## Why the invariant matters
 *
 * An absolute URL in stored content bakes in whichever host wrote it. The CKEditor media library
 * does exactly that — it prefixes `window.strapi.backendURL`, i.e. the host the admin panel is
 * open on, onto the `src`, every `srcset` candidate, `<source src>` and the `<a href>` it writes
 * for non-image uploads. That is how 42 articles came to hold 273 references to
 * `http://localhost:1339`, which resolve nowhere but the machine that authored them.
 *
 * A `backend/src/index.ts` document-service middleware now normalises this on every write, so new
 * content cannot regress. This script is the detector and the repair path for anything written
 * before that guard, imported out-of-band, or edited directly in the database.
 *
 * ## Scope
 *
 * Only paths under `/uploads/`. Externally hosted images and internal links such as
 * `/discounts/brazzers/` are left untouched — this normalises our own media, it is not a URL
 * rewriter.
 *
 * Usage:
 *   node scripts/normalize-media-urls.mjs --check      # exit 1 if any absolute URL exists (CI)
 *   node scripts/normalize-media-urls.mjs --dry-run    # report what would change
 *   node scripts/normalize-media-urls.mjs              # repair in place
 *   node scripts/normalize-media-urls.mjs --only articles
 *
 * Environment (scripts/.env): STRAPI_URL, STRAPI_TOKEN
 */

import { requireToken, fetchAll, STRAPI_URL, TOKEN } from './lib/strapi.mjs';
import { flagValue, hasFlag } from './lib/jobs.mjs';

requireToken();

const CHECK = hasFlag('check');
const DRY_RUN = hasFlag('dry-run');
const ONLY = flagValue('only');

/** Every collection. A new content type must be added here or it goes unchecked. */
const COLLECTIONS = [
  'articles', 'authors', 'bundles', 'categories', 'commercials', 'featureds',
  'offers', 'pages', 'platforms', 'reviews', 'sales', 'sites', 'tags',
];

/** Absolute or protocol-relative URL whose path starts at `/uploads/`. Captures the path. */
const ABSOLUTE_UPLOAD = /(?:https?:)?\/\/[^/"'\s>]+(\/uploads\/[^"'\s>)]*)/gi;

const toRelative = (s) => s.replace(ABSOLUTE_UPLOAD, (_m, path) => path);
const countAbs = (s) => (s.match(ABSOLUTE_UPLOAD) ?? []).length;

/** Recursively normalise every string, returning the input unchanged when nothing matched. */
function normalize(value) {
  if (typeof value === 'string') {
    const next = toRelative(value);
    return next === value ? value : next;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => { const n = normalize(v); if (n !== v) changed = true; return n; });
    return changed ? next : value;
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const next = {};
    for (const [k, v] of Object.entries(value)) { const n = normalize(v); if (n !== v) changed = true; next[k] = n; }
    return changed ? next : value;
  }
  return value;
}

/** Deep count, for detection only — reaches into components and blocks. */
function deepCount(value) {
  if (typeof value === 'string') return countAbs(value);
  if (Array.isArray(value)) return value.reduce((s, v) => s + deepCount(v), 0);
  if (value && typeof value === 'object') return Object.values(value).reduce((s, v) => s + deepCount(v), 0);
  return 0;
}

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
const collections = COLLECTIONS.filter((c) => !ONLY || c === ONLY);

let totalAbs = 0, totalDeepOnly = 0;
const plan = [];

for (const collection of collections) {
  // Fetched WITHOUT populate on purpose. Relations would come back as full objects, and PUTting
  // those back can rewire or duplicate them — scalar and `blocks` fields are all that can hold a
  // media URL we are allowed to rewrite. A separate deep pass below reports anything else.
  let rows;
  try { rows = await fetchAll(collection, 'status=draft'); }
  catch { try { rows = await fetchAll(collection, ''); } catch { console.error(`  ! skipped ${collection}`); continue; } }

  let deepRows;
  try { deepRows = await fetchAll(collection, 'populate=*&status=draft'); }
  catch { try { deepRows = await fetchAll(collection, 'populate=*'); } catch { deepRows = rows; } }

  let collAbs = 0;
  for (const row of rows) {
    const changed = {};
    for (const [field, value] of Object.entries(row)) {
      if (['id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale'].includes(field)) continue;
      const n = normalize(value);
      if (n !== value) { changed[field] = n; collAbs += deepCount(value); }
    }
    if (Object.keys(changed).length) {
      plan.push({ collection, documentId: row.documentId, label: row.slug ?? row.name ?? row.id, changed });
    }
  }

  // Anything visible only with populate is in a component or relation — report, never rewrite.
  // Note the count can double-report: populate=* pulls related entries whole (e.g. an author's
  // articles, content included), so an offender may show under its own collection AND under a
  // relation. Fine for a pass/fail check; do not treat the numbers as a distinct-offender count.
  const deepTotal = deepRows.reduce((s, r) => s + deepCount(r), 0);
  const shallowTotal = rows.reduce((s, r) => s + deepCount(r), 0);
  const deepOnly = Math.max(0, deepTotal - shallowTotal);

  totalAbs += collAbs;
  totalDeepOnly += deepOnly;
  if (collAbs || deepOnly) {
    console.log(`  ${collection.padEnd(13)} rows=${String(rows.length).padStart(4)}  absolute=${collAbs}` +
      (deepOnly ? `  (+${deepOnly} inside components/relations — reported only)` : ''));
  }
}

for (const p of plan) {
  console.log(`    ${p.collection}/${p.label}: ${Object.keys(p.changed).join(', ')}`);
}

console.log(`\nchecked ${collections.length} collection(s): ${totalAbs} absolute upload URL(s) in writable fields` +
  (totalDeepOnly ? `, ${totalDeepOnly} in components/relations` : ''));

if (CHECK) {
  const bad = totalAbs + totalDeepOnly;
  console.log(bad === 0
    ? '✓ all stored media URLs are relative'
    : `✗ ${bad} absolute media URL(s) found — run without --check to repair`);
  process.exit(bad ? 1 : 0);
}
if (DRY_RUN) { console.log('\n--dry-run: no writes'); process.exit(0); }
if (!plan.length) { console.log('\nnothing to do'); process.exit(totalDeepOnly ? 1 : 0); }

let ok = 0, failed = 0;
for (const p of plan) {
  const res = await fetch(`${STRAPI_URL}/api/${p.collection}/${p.documentId}`, {
    method: 'PUT', headers, body: JSON.stringify({ data: p.changed }),
  });
  if (res.ok) ok += 1;
  else { failed += 1; console.error(`  FAIL ${p.collection}/${p.label}: ${res.status} ${(await res.text()).slice(0, 160)}`); }
}
console.log(`\nwrote ${ok}, failed ${failed}`);
process.exit(failed || totalDeepOnly ? 1 : 0);
