#!/usr/bin/env node
/**
 * audit-parent-sites.mjs
 *
 * Queries Strapi and compares current parent-child site relationships against
 * the expected list. Outputs what's missing, what's unlinked, and what's extra.
 *
 * Usage:
 *   node scripts/audit-parent-sites.mjs
 *
 * Environment:
 *   STRAPI_URL    (default: http://localhost:1339)
 *   STRAPI_TOKEN  API token for Strapi
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');
dotenv.config({ path: `${__dirname}/.env` });

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;

if (!TOKEN) {
  console.error('Error: STRAPI_TOKEN is required.');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}` };

// ── Expected network list (from user's data) ───────────────────────────────────
// Format: { parent: 'Parent Site Name', subsites: ['Sub1', 'Sub2', ...] }
const EXPECTED = [
  {
    parent: 'Bad Daddy POV',
    subsites: [
      'Your Mom Does Porn', 'Your Mom Does Anal', 'Twisted Visual', 'Teenage Anal Sluts',
      'POV Perverts', 'Pervert Gallery', 'Only Prince', 'James Deen', 'Homemade Anal Whores',
      'Her Gape', 'Girl Faction', 'DTF Sluts', 'Anal Violation', 'Anal BBC',
    ],
  },
  {
    parent: 'Analized',
    subsites: [
      // Shared with Bad Daddy POV — tracked but not re-created
      'Your Mom Does Porn', 'Twisted Visual', 'POV Perverts', 'Pervert Gallery',
      'Only Prince', 'James Deen', 'Girl Faction', 'DTF Sluts', 'Bad Daddy POV',
    ],
  },
  { parent: 'TeamSkeet',   subsites: ['Hoby Buchanon'] },
  { parent: 'Thai Swinger', subsites: ['Latina Raw', 'Isan Unseen'] },
  { parent: 'New Sensations', subsites: ['The Romance Series', 'Tales From The Edge'] },
  {
    parent: 'Ladyboy Gold',
    subsites: ['TS RAW', 'Ladyboy Tube', 'Ladyboy Crush'],
  },
  {
    parent: "Devil's Film",
    subsites: [
      'White Ghetto', 'Tranny Pros', 'Transsexual Road Trip', 'Tera Patrick', 'Squirtalicious',
      'Silvia Saint', 'Silverstone DVD', 'Rocco Siffredi', 'POV This', 'Peter North DVD',
      'Peter North', 'Out Of the Family', 'My Teen Oasis', 'Mother Fucker XXX', 'Low Art Films',
      'Lesbian Factor', 'I Swallow Peter North', 'Hairy Undies', 'Granny Ghetto', 'Give Me Teens',
      'Devils GangBang', 'Devils Film Parodies', 'Daring Sex', 'Curry Creampie', 'Cum Shot Oasis',
      'Bushy Bushy', 'Big Fat Creampie', 'FameDigital Network',
    ],
  },
  {
    parent: 'Fetish Network',
    subsites: [
      'Taboo Tug Jobs', 'Shibari Dolls', 'Punished Angels', 'Perfect Spanking',
      'Panty Girlfriends', 'Jerkoff Girlfriends', 'Japanese Femdom Videos',
      'Femdom Academy', 'Cash Fetish', 'Brutal Punishment', 'Brutal Dungeon',
    ],
  },
  {
    parent: 'Blowpass',
    subsites: ['Cock Sucking Challenge', 'Squirting Orgies', 'Sunlust XXX'],
  },
  {
    parent: 'Girlsway',
    subsites: ['Girlsway Originals', 'Sex Tape Lesbians', 'Girls Try Anal', "Mommy's Girl"],
  },
  {
    parent: 'Wankz',
    subsites: ['Bubbly Massage', 'Brother Undercover', 'Blow Patrol'],
  },
  {
    parent: 'Mofos',
    subsites: ['Drone Hunter', 'Project RV', 'Busted Babysitters'],
  },
  {
    parent: 'Pornstar Platinum',
    subsites: ['Yuri Luv', 'Pornstar Platinum Mobile', 'Nina Elle XXX', 'Fukks'],
  },
  {
    parent: 'Puba',
    subsites: ['Romi Rain', 'Nicole Aniston', 'Mia Lelani', 'Dana DeArmond', 'Dahlia Sky', 'Brett Rossi'],
  },
  {
    parent: 'PornPros',
    subsites: ['Milf Humiliation', 'Cum Disgrace'],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const normalise = (s) => s.toLowerCase().trim();

async function fetchAllSites() {
  let page = 1;
  const pageSize = 100;
  const all = [];

  while (true) {
    const params = new URLSearchParams({
      'populate[0]': 'parent_site',
      'populate[1]': 'child_sites',
      'filters[isActive][$eq]': 'true',
      'pagination[page]': String(page),
      'pagination[pageSize]': String(pageSize),
    });
    const res = await fetch(`${STRAPI_URL}/api/sites?${params}`, { headers });
    if (!res.ok) throw new Error(`fetchAllSites page ${page}: ${res.status} ${await res.text()}`);
    const { data, meta } = await res.json();
    all.push(...data);
    if (page >= (meta?.pagination?.pageCount ?? 1)) break;
    page++;
  }

  return all;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching all active sites from ${STRAPI_URL}…\n`);
  const sites = await fetchAllSites();

  // Build lookup maps
  const byName = new Map(sites.map((s) => [normalise(s.name), s]));
  const bySlug = new Map(sites.map((s) => [s.slug, s]));

  const parentSites = sites.filter((s) => (s.child_sites ?? []).length > 0);
  const childSites  = sites.filter((s) => s.parent_site != null);

  console.log(`Total active sites in DB : ${sites.length}`);
  console.log(`Parent sites (with children) : ${parentSites.length}`);
  console.log(`Child sites (with parent)    : ${childSites.length}\n`);

  // ── 1. Current DB tree ───────────────────────────────────────────────────────
  console.log('─'.repeat(60));
  console.log('CURRENT DB PARENT → CHILD TREE');
  console.log('─'.repeat(60));
  for (const parent of parentSites.sort((a, b) => a.name.localeCompare(b.name))) {
    const children = (parent.child_sites ?? []).sort((a, b) => a.name.localeCompare(b.name));
    console.log(`\n📦 ${parent.name} (${parent.slug})  [${children.length} children]`);
    for (const child of children) {
      console.log(`   └─ ${child.name} (${child.slug})`);
    }
  }

  // ── 2. Diff vs expected list ─────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('DIFF vs EXPECTED LIST');
  console.log('─'.repeat(60));

  const missingParents = [];
  const missingSubsites = [];
  const wrongParent = [];

  for (const entry of EXPECTED) {
    const parentInDb = byName.get(normalise(entry.parent));

    if (!parentInDb) {
      missingParents.push(entry.parent);
      for (const sub of entry.subsites) {
        missingSubsites.push({ subsite: sub, expectedParent: entry.parent, status: 'parent missing' });
      }
      continue;
    }

    const childNames = new Set((parentInDb.child_sites ?? []).map((c) => normalise(c.name)));

    for (const sub of entry.subsites) {
      const subInDb = byName.get(normalise(sub));

      if (!subInDb) {
        missingSubsites.push({ subsite: sub, expectedParent: entry.parent, status: 'not in DB' });
        continue;
      }

      if (!childNames.has(normalise(sub))) {
        // Site exists but is not linked to this parent
        const actualParent = subInDb.parent_site?.name ?? '(none)';
        if (actualParent !== entry.parent) {
          wrongParent.push({
            subsite: sub,
            expectedParent: entry.parent,
            actualParent,
          });
        }
      }
    }
  }

  // Orphaned child sites (have parent_site in DB but not in expected list)
  const expectedSubNames = new Set(
    EXPECTED.flatMap((e) => e.subsites.map(normalise))
  );
  const orphans = childSites.filter((s) => !expectedSubNames.has(normalise(s.name)));

  // ── Output results ──────────────────────────────────────────────────────────
  if (missingParents.length > 0) {
    console.log(`\n🔴 MISSING PARENT SITES (${missingParents.length}):`);
    for (const p of missingParents) console.log(`   • ${p}`);
  } else {
    console.log('\n✅ All expected parent sites exist in DB');
  }

  if (missingSubsites.length > 0) {
    console.log(`\n🟡 MISSING / UNLINKED SUBSITES (${missingSubsites.length}):`);
    for (const { subsite, expectedParent, status } of missingSubsites) {
      console.log(`   • ${subsite}  →  ${expectedParent}  [${status}]`);
    }
  } else {
    console.log('\n✅ All expected subsites exist and are linked');
  }

  if (wrongParent.length > 0) {
    console.log(`\n🟠 WRONG PARENT LINK (${wrongParent.length}):`);
    for (const { subsite, expectedParent, actualParent } of wrongParent) {
      console.log(`   • ${subsite}  expected→ ${expectedParent}  actual→ ${actualParent}`);
    }
  }

  if (orphans.length > 0) {
    console.log(`\n⚪ ORPHAN CHILD SITES (in DB with parent, not in expected list) (${orphans.length}):`);
    for (const s of orphans.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`   • ${s.name} (${s.slug})  parent→ ${s.parent_site.name}`);
    }
  }

  // ── 3. Parent sites in expected list but no children at all in DB ────────────
  const parentsWithNoChildren = EXPECTED
    .filter((e) => {
      const p = byName.get(normalise(e.parent));
      return p && (p.child_sites ?? []).length === 0;
    })
    .map((e) => e.parent);

  if (parentsWithNoChildren.length > 0) {
    console.log(`\n🔵 PARENT SITES WITH 0 CHILDREN IN DB (${parentsWithNoChildren.length}):`);
    for (const p of parentsWithNoChildren) console.log(`   • ${p}`);
  }

  console.log('\n' + '─'.repeat(60));
  console.log('SUMMARY');
  console.log('─'.repeat(60));
  console.log(`Missing parents   : ${missingParents.length}`);
  console.log(`Missing subsites  : ${missingSubsites.filter((s) => s.status === 'not in DB').length}`);
  console.log(`Unlinked subsites : ${missingSubsites.filter((s) => s.status !== 'not in DB').length + wrongParent.length}`);
  console.log(`Orphan children   : ${orphans.length}`);
  console.log('\nRun import-sites.mjs to fix missing entries.');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
