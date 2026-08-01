#!/usr/bin/env node
/**
 * backfill-post-ids.mjs
 *
 * Sets `article.postId` on every Strapi article so its URL matches production
 * pornmode.com exactly (`/blog/<postId>/<slug>/`).
 *
 * Strapi assigns its own auto-increment `id`, which is why 36 of the 85 recreated legacy
 * posts currently sit on URLs Google has never seen. `postId` is a data field, so scripts
 * can set it and it survives the delete+recreate that `--force` regeneration performs.
 *
 * Articles with a slug in data/wp-post-ids.json get their WP id. Articles with no WP
 * counterpart (new content) get the next free id ABOVE the legacy maximum, so a fresh
 * article can never collide with a legacy id that hasn't been imported yet.
 *
 * Idempotent — safe to re-run; only writes where the value would change.
 *
 * Usage:
 *   node scripts/backfill-post-ids.mjs [--dry-run] [--map <path>]
 *
 * Environment (scripts/.env): STRAPI_URL, STRAPI_TOKEN
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: `${__dirname}/.env`, quiet: true });

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;
if (!TOKEN) { console.error('Error: STRAPI_TOKEN is required.'); process.exit(1); }

const flagValue = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const DRY_RUN = process.argv.includes('--dry-run');
const MAP_PATH = flagValue('map') ?? join(__dirname, 'data', 'wp-post-ids.json');

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const bySlug = map.posts ?? map;
const legacyMax = Math.max(...Object.values(bySlug));

/** Fetch every article (draft + published) with the fields we need. */
async function fetchAllArticles() {
  const out = [];
  let page = 1;
  for (;;) {
    const res = await fetch(
      `${STRAPI_URL}/api/articles?fields[0]=slug&fields[1]=postId&fields[2]=title` +
        `&publicationState=preview&pagination[page]=${page}&pagination[pageSize]=100`,
      { headers },
    );
    if (!res.ok) throw new Error(`Fetch articles failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    out.push(...json.data);
    const pageCount = json.meta?.pagination?.pageCount ?? 1;
    if (page >= pageCount) break;
    page += 1;
  }
  return out;
}

const articles = await fetchAllArticles();
console.log(`articles: ${articles.length}   legacy map: ${Object.keys(bySlug).length} slugs (max id ${legacyMax})\n`);

// Reserve ids already in use so a re-run never hands out a duplicate.
const taken = new Set(articles.map((a) => a.postId).filter((v) => typeof v === 'number'));
let nextFree = Math.max(legacyMax, ...(taken.size ? [...taken] : [0])) + 1;

const planned = [];
for (const a of articles) {
  const wpId = bySlug[a.slug];
  if (wpId !== undefined) {
    if (a.postId === wpId) { planned.push({ ...a, target: wpId, action: 'ok' }); continue; }
    planned.push({ ...a, target: wpId, action: 'set-legacy' });
    taken.add(wpId);
  } else if (typeof a.postId === 'number') {
    planned.push({ ...a, target: a.postId, action: 'ok' });
  } else {
    while (taken.has(nextFree)) nextFree += 1;
    planned.push({ ...a, target: nextFree, action: 'set-new' });
    taken.add(nextFree);
    nextFree += 1;
  }
}

const toWrite = planned.filter((p) => p.action !== 'ok');
for (const p of planned) {
  const tag = p.action === 'ok' ? '  =' : p.action === 'set-legacy' ? ' WP' : 'NEW';
  if (p.action !== 'ok') console.log(`${tag} ${String(p.target).padStart(5)}  ${p.slug}`);
}
console.log(
  `\nunchanged: ${planned.length - toWrite.length}   ` +
    `legacy: ${toWrite.filter((p) => p.action === 'set-legacy').length}   ` +
    `new: ${toWrite.filter((p) => p.action === 'set-new').length}`,
);

// Legacy slugs present in the map but not yet recreated in Strapi — the remaining backlog.
const missing = Object.keys(bySlug).filter((s) => !articles.some((a) => a.slug === s));
if (missing.length) console.log(`\nnot yet recreated in Strapi: ${missing.length} legacy posts`);

if (DRY_RUN) { console.log('\n--dry-run: no writes'); process.exit(0); }
if (!toWrite.length) { console.log('\nnothing to do'); process.exit(0); }

let ok = 0, failed = 0;
for (const p of toWrite) {
  const res = await fetch(`${STRAPI_URL}/api/articles/${p.documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { postId: p.target } }),
  });
  if (res.ok) { ok += 1; }
  else { failed += 1; console.error(`  FAIL ${p.slug}: ${res.status} ${(await res.text()).slice(0, 160)}`); }
}
console.log(`\nwrote ${ok}, failed ${failed}`);
process.exit(failed ? 1 : 0);
