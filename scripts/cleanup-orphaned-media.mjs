#!/usr/bin/env node
/**
 * cleanup-orphaned-media.mjs
 *
 * Deletes uploaded media that nothing references.
 *
 * Where the orphans come from: re-running an importer re-uploads rather than reusing (Strapi
 * appends a hash to the filename, so `hot-and-mean-cover.png` and `hot_and_mean_cover_4c07.jpg`
 * coexist and only the newer one is attached), and a `--dry-run` generation still uploads its
 * section images before printing instead of writing. Neither leaves a trace in the admin — the
 * media library just grows.
 *
 * HOW REFERENCES ARE FOUND — this is the part that has to be right, because a false orphan is
 * a deleted live image. Rather than enumerate media fields per content type (and miss one when
 * a schema changes), every collection is fetched with `populate=*` INCLUDING drafts, the whole
 * response is stringified, and every `/uploads/<filename>` occurrence is collected. That covers
 * media relations, media inside components, and `/uploads/` URLs embedded in rich-text bodies
 * alike. A file survives if its own URL or ANY of its generated format URLs is referenced.
 *
 * Deliberately conservative: the matcher over-collects (it also picks up /uploads/ paths that
 * belong to external source URLs), and over-collecting can only ever spare a file, never
 * condemn one.
 *
 * Files are copied to data/media-trash/ before deletion unless --no-backup.
 *
 * Usage:
 *   node scripts/cleanup-orphaned-media.mjs --dry-run      # always run this first
 *   node scripts/cleanup-orphaned-media.mjs [--no-backup] [--yes-i-mean-it]
 *
 * Environment (scripts/.env): STRAPI_URL, STRAPI_TOKEN
 */

import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { requireToken, fetchAll, STRAPI_URL, TOKEN } from './lib/strapi.mjs';
import { hasFlag } from './lib/jobs.mjs';
import { getBuffer } from './lib/http.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

requireToken();

const DRY_RUN = hasFlag('dry-run');
const NO_BACKUP = hasFlag('no-backup');
const TRASH = join(__dirname, 'data', 'media-trash');

/** Every collection that could hold a media reference, in any field or component. */
const COLLECTIONS = [
  'articles', 'authors', 'bundles', 'categories', 'commercials', 'featureds',
  'offers', 'pages', 'platforms', 'reviews', 'sales', 'sites', 'tags',
];

const headers = { Authorization: `Bearer ${TOKEN}` };
const kb = (n) => `${(n / 1024).toFixed(1)} MB`;

const referenced = new Set();
const perCollection = [];
for (const c of COLLECTIONS) {
  let rows;
  try { rows = await fetchAll(c, 'populate=*&status=draft'); }
  catch {
    // Types without draft & publish reject `status=draft`.
    try { rows = await fetchAll(c, 'populate=*'); }
    catch (e) { console.error(`  ! skipped ${c}: ${e.message.slice(0, 90)}`); continue; }
  }
  const hits = [...JSON.stringify(rows).matchAll(/\/uploads\/([A-Za-z0-9_.\-]+?\.[a-z0-9]{2,5})/g)].map((m) => m[1]);
  hits.forEach((h) => referenced.add(h));
  perCollection.push([c, rows.length, new Set(hits).size]);
}

console.log('collection        entries   distinct media refs');
for (const [c, n, m] of perCollection) console.log(`  ${c.padEnd(14)} ${String(n).padStart(6)} ${String(m).padStart(20)}`);
console.log(`\ndistinct referenced filenames: ${referenced.size}`);

// A bare array, and it ignores pagination params — the whole library comes back at once.
const files = await (await fetch(`${STRAPI_URL}/api/upload/files`, { headers })).json();
if (!Array.isArray(files)) { console.error('unexpected /upload/files response'); process.exit(1); }

const namesOf = (f) => [f.url, ...Object.values(f.formats ?? {}).map((v) => v?.url)]
  .filter(Boolean).map((u) => u.split('/').pop());

const orphans = files.filter((f) => !namesOf(f).some((n) => referenced.has(n)));
const totalKb = orphans.reduce((s, f) => s + (f.size ?? 0), 0);

console.log(`\nupload files: ${files.length}`);
console.log(`ORPHANS:      ${orphans.length}  (${kb(totalKb)})`);
const byExt = {};
for (const o of orphans) byExt[o.ext] = (byExt[o.ext] ?? 0) + 1;
console.log(`by type:      ${Object.entries(byExt).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e} ${n}`).join('   ')}`);

if (orphans.length) {
  console.log('\nlargest 12:');
  for (const o of [...orphans].sort((a, b) => b.size - a.size).slice(0, 12)) {
    console.log(`  ${kb(o.size).padStart(9)}  ${o.createdAt.slice(0, 10)}  ${o.name.slice(0, 66)}`);
  }
}

if (DRY_RUN) {
  mkdirSync(TRASH, { recursive: true });
  writeFileSync(join(TRASH, 'orphans.json'), JSON.stringify(orphans, null, 1));
  console.log(`\n--dry-run: nothing deleted. Full list written to data/media-trash/orphans.json`);
  process.exit(0);
}
if (!orphans.length) { console.log('\nnothing to do'); process.exit(0); }

if (!hasFlag('yes-i-mean-it')) {
  console.error(`\nThis deletes ${orphans.length} files (${kb(totalKb)}) and cannot be undone from the admin.`);
  console.error('Re-run with --yes-i-mean-it once the --dry-run list looks right.');
  process.exit(1);
}

if (!NO_BACKUP) {
  mkdirSync(TRASH, { recursive: true });
  writeFileSync(join(TRASH, 'orphans.json'), JSON.stringify(orphans, null, 1));
  let saved = 0;
  for (const o of orphans) {
    try {
      const url = o.url.startsWith('http') ? o.url : `${STRAPI_URL}${o.url}`;
      writeFileSync(join(TRASH, o.url.split('/').pop()), await getBuffer(url, { label: o.name }));
      saved += 1;
    } catch (e) { console.error(`  ! backup failed ${o.name}: ${e.message.slice(0, 80)}`); }
  }
  console.log(`\nbacked up ${saved}/${orphans.length} to data/media-trash/`);
}

let ok = 0, failed = 0;
for (const o of orphans) {
  const res = await fetch(`${STRAPI_URL}/api/upload/files/${o.id}`, { method: 'DELETE', headers });
  if (res.ok) ok += 1;
  else { failed += 1; console.error(`  FAIL ${o.name}: ${res.status}`); }
}
console.log(`\ndeleted ${ok}, failed ${failed}   (freed ~${kb(totalKb)})`);
process.exit(failed ? 1 : 0);
