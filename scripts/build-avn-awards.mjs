#!/usr/bin/env node
/**
 * build-avn-awards.mjs
 *
 * Builds a cached map of AVN headline performer awards from Wikipedia's dedicated
 * award-list pages (clean year→winner tables) and writes scripts/data/avn-awards.json.
 *
 * Output shape:
 *   { "<normalized name>": { "name": "Display Name", "awards": ["Female Performer of the Year (2012)", "AVN Hall of Fame"] } }
 *
 * Run occasionally (data changes ~once a year):
 *   node scripts/build-avn-awards.mjs
 */

import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'data', 'avn-awards.json');
const UA = 'Mozilla/5.0 (compatible; pm-scripts/1.0)';

// Dedicated Wikipedia list pages → headline award label. `hof` keeps the label year-less.
const SOURCES = [
  { title: 'AVN Award for Female Performer of the Year', award: 'Female Performer of the Year' },
  { title: 'AVN Award for Male Performer of the Year', award: 'Male Performer of the Year' },
  { title: 'List of members of the AVN Hall of Fame', award: 'AVN Hall of Fame', hof: true },
];

const normKey = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function wikitext(title) {
  const url = `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const text = await res.text();
  if (/^#REDIRECT/i.test(text.trim())) return { redirect: text.match(/\[\[([^\]]+)\]\]/)?.[1] ?? null };
  return { text };
}

/** Extract a clean performer name from a single table cell (linked or plain). */
function cellName(cell) {
  let c = (cell || '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .trim();
  const link = c.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (link) c = (link[2] || link[1]);
  c = c.replace(/<[^>]+>/g, ' ').replace(/'''?/g, '').split('|').pop().trim();
  c = c.split(/\s{2,}/)[0].trim();
  c = c.replace(/\s*\([^)]*\)\s*$/, '').trim(); // drop Wikipedia disambiguation, e.g. "Hillary Scott (actress)"
  if (!c || c.length < 3 || c.length > 40 || /[=]/.test(c) || /^[a-z]/.test(c)) return null;
  return c;
}

/** Split a `|-`-delimited row block into ordered cells (handles one-per-line and `||`/`!!`). */
function rowCells(block) {
  const cells = [];
  for (let line of block.split('\n')) {
    line = line.replace(/\r/g, '').trim();
    if (!line || line[0] !== '|' && line[0] !== '!') continue; // skip refs, * nominee bullets, etc.
    if (/^(\{\||\|\}|\|\+)/.test(line)) continue;
    const rest = line.replace(/^[|!]\s?/, '');
    for (const p of rest.split(/\|\||!!/)) cells.push(p.trim());
  }
  return cells;
}

/** Column-aware winners parse: find the Winner/Member column from the header, read it per row. */
function parseWinners(text) {
  const out = []; // { name, year }
  const tables = text.match(/\{\|[\s\S]*?\n\|\}/g) || [];
  for (const table of tables) {
    const blocks = table.split(/\n\|-/);
    let headerBlock = null, personIdx = -1, yearIdx = 0;
    for (const b of blocks) {
      const hdr = rowCells(b);
      const pi = hdr.findIndex((c) => /^(winners?|inductees?|member)$/i.test(c));
      if (pi >= 0) { headerBlock = b; personIdx = pi; const yi = hdr.findIndex((c) => /^year$/i.test(c)); if (yi >= 0) yearIdx = yi; break; }
    }
    if (personIdx < 0) continue; // no recognizable winner column → skip table
    for (const b of blocks) {
      if (b === headerBlock) continue;
      const cells = rowCells(b);
      if (cells.length <= personIdx) continue;
      const name = cellName(cells[personIdx]);
      if (!name) continue;
      // Strip refs/templates first so a citation/archive date inside the year cell
      // isn't mistaken for the award year (esp. Hall of Fame rows).
      const yearCell = (cells[yearIdx] || '')
        .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
        .replace(/<ref[^>]*\/>/gi, '')
        .replace(/\{\{[^}]*\}\}/g, '');
      const year = yearCell.match(/\b(19|20)\d{2}\b/)?.[0];
      out.push({ name, year: year ? Number(year) : null });
    }
  }
  return out;
}

async function main() {
  const byName = new Map(); // normKey -> { name, awards: Set }

  for (const src of SOURCES) {
    const wt = await wikitext(src.title);
    if (!wt) { console.log(`✗ ${src.title}: fetch failed`); continue; }
    if (wt.redirect) { console.log(`↪ ${src.title}: redirect → ${wt.redirect} (skipped)`); continue; }

    const winners = parseWinners(wt.text);
    let added = 0;
    for (const w of winners) {
      const key = normKey(w.name);
      if (key.length < 3) continue;
      if (!byName.has(key)) byName.set(key, { name: w.name, awards: new Set() });
      const label = `${src.award}${w.year ? ` (${w.year})` : ''}`;
      byName.get(key).awards.add(label);
      added++;
    }
    console.log(`✓ ${src.title}: ${added} winner rows`);
  }

  const result = {};
  for (const [key, v] of byName) result[key] = { name: v.name, awards: [...v.awards].sort() };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`\nSaved ${Object.keys(result).length} performers → ${OUT}`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
