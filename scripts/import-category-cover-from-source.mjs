#!/usr/bin/env node
/**
 * import-category-cover-from-source.mjs
 *
 * Imports category cover images into the Strapi `cover_image` media field,
 * sourced from the PornDiscounts category index (https://www.porndiscounts.com/category/).
 *
 * Each category on that page is rendered as:
 *   <a class="item" href="/category/<slug>/">
 *     <div class="img-holder">
 *       <img class="img ..." alt="<Name>" src="https://static.porndiscounts.com/.../thumb.jpg">
 *
 * Our categories use a "-porn" suffix and "-and-" joiners (e.g. `anal-porn`,
 * `mature-and-milf-porn`); PornDiscounts uses bare slugs (`anal`, `milf-mature`).
 * Matching normalizes those differences and falls back to an explicit alias table.
 *
 * Usage:
 *   node scripts/import-category-cover-from-source.mjs [options] [slug1 slug2 ...]
 *
 * Options:
 *   --all             Process all categories
 *   --force           Overwrite existing cover image assignments
 *   --category=slug   Process a single category slug
 *   --categories=a,b  Process a comma-separated list of category slugs
 *   --dry-run         Resolve + report matches without uploading or writing
 *
 * Environment:
 *   STRAPI_URL        (default: http://localhost:1339)
 *   STRAPI_TOKEN      API token for Strapi
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, extname } from 'path';
import { tmpdir } from 'os';
import { unlink, writeFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

require('dotenv').config({ path: `${__dirname}/.env`, quiet: true });

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;

if (!TOKEN) {
  console.error('Error: STRAPI_TOKEN is required.');
  process.exit(1);
}

const CATEGORY_INDEX_URL = 'https://www.porndiscounts.com/category/';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};

const noH = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Tokens that only describe our naming convention, not the niche itself.
const NOISE_TOKENS = new Set(['porn', 'sex', 'and']);

// Explicit slug → PornDiscounts slug, for matches normalization can't reach.
const ALIASES = {
  'vr-porn': 'virtual-reality',
  'live-sex': 'webcams',
  'trans-porn': 'shemale',
  'teen-porn': '18-23',
  'cuckold-porn': 'cuckolds',
  'feet-porn': 'legs-feet',
  'handjob-porn': 'handjobs',
  'taboo-porn': 'step-family-porn',
  'mature-and-milf-porn': 'milf-mature',
  'artsy-and-erotic-porn': 'erotica',
  'solo-female-masturbation-porn': 'masturbation',
  'outdoor-and-public-sex-porn': 'public',
};

// ── CLI parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const forceMode = args.includes('--force');
const allMode = args.includes('--all');
const dryRun = args.includes('--dry-run');
const cliCategoryArgs = args
  .filter((arg) => arg.startsWith('--category=') || arg.startsWith('--categories='))
  .flatMap((arg) => arg.split('=')[1]?.split(',') ?? [])
  .map((arg) => arg.trim())
  .filter(Boolean);
const positionalSlugs = args.filter((arg) => !arg.startsWith('--'));
const slugs = [...new Set([...positionalSlugs, ...cliCategoryArgs])];

if (allMode && slugs.length > 0) {
  console.error('Use either --all or an explicit category list, not both.');
  process.exit(1);
}

if (!allMode && slugs.length === 0) {
  console.error('Usage: node scripts/import-category-cover-from-source.mjs [--all | slug1 slug2 ... | --category=slug | --categories=a,b] [--force] [--dry-run]');
  process.exit(1);
}

// ── Source: PornDiscounts category index ─────────────────────────────────────

/**
 * Returns a Map of lookup-key → image URL. Each category is indexed under several
 * keys (raw slug, depluralized slug, individual slug tokens, and the alt-text name)
 * so our suffixed/joined slugs can find it.
 */
async function buildPornDiscountsCategoryMap() {
  const response = await fetch(CATEGORY_INDEX_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Failed to fetch category index: ${response.status}`);
  }

  const html = await response.text();
  const re = /<a class="item" href="\/category\/([^/"]+)\/">\s*<div class="img-holder">\s*<img[^>]*alt="([^"]*)"[^>]*src="([^"]+)"/g;

  const map = new Map();
  const addKey = (key, url) => {
    const normalized = noH(key);
    if (normalized && !map.has(normalized)) map.set(normalized, url);
  };

  let match;
  let count = 0;
  while ((match = re.exec(html))) {
    const [, slug, name, url] = match;
    count += 1;

    addKey(slug, url);
    addKey(name, url);

    const tokens = slug.split('-').filter((t) => !NOISE_TOKENS.has(t));
    // Joined form and each individual token (so "milf-mature" matches "milf").
    addKey(tokens.join(''), url);
    for (const token of tokens) {
      addKey(token, url);
      addKey(token.replace(/s$/, ''), url); // depluralize: handjobs → handjob
    }
  }

  if (count === 0) {
    throw new Error('Parsed 0 categories from the index page — markup may have changed.');
  }

  return { map, count };
}

/** Candidate lookup keys for one of our categories, most specific first. */
function candidateKeys(slug, name) {
  const keys = [];

  // 1. Explicit alias wins.
  if (ALIASES[slug]) keys.push(noH(ALIASES[slug]));

  // 2. Raw slug / name.
  keys.push(noH(slug));
  keys.push(noH(name));

  // 3. Slug minus noise tokens, joined and per-token.
  const tokens = slug.split('-').filter((t) => !NOISE_TOKENS.has(t));
  keys.push(noH(tokens.join('')));
  for (const token of tokens) {
    keys.push(noH(token));
    keys.push(noH(token.replace(/s$/, '')));
  }

  return [...new Set(keys.filter(Boolean))];
}

function resolveCategoryImage(map, slug, name) {
  for (const key of candidateKeys(slug, name)) {
    const url = map.get(key);
    if (url) return url;
  }
  return null;
}

// ── Strapi helpers ───────────────────────────────────────────────────────────

async function fetchCategories() {
  const all = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const params = new URLSearchParams({
      'fields[0]': 'name',
      'fields[1]': 'slug',
      'populate[cover_image][fields][0]': 'id',
      'pagination[page]': String(page),
      'pagination[pageSize]': String(pageSize),
    });

    if (!allMode && slugs.length > 0) {
      slugs.forEach((slug, index) => {
        params.append(`filters[$or][${index}][slug][$eq]`, slug);
      });
    }

    const response = await fetch(`${STRAPI_URL}/api/categories?${params}`, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch categories page ${page}: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    all.push(...payload.data);

    if (page >= (payload.meta?.pagination?.pageCount ?? 1)) break;
    page += 1;
  }

  return all;
}

async function uploadImage(imageUrl, filename) {
  const response = await fetch(imageUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${imageUrl}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const tmpPath = `${tmpdir()}/${filename}`;
  await writeFile(tmpPath, buffer);

  try {
    const form = new FormData();
    const blob = new Blob([buffer], { type: response.headers.get('content-type') || 'image/jpeg' });
    form.append('files', blob, filename);

    const uploadResponse = await fetch(`${STRAPI_URL}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: form,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload image: ${uploadResponse.status} ${await uploadResponse.text()}`);
    }

    const [file] = await uploadResponse.json();
    return file?.id ?? null;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

async function updateCategoryCover(documentId, coverId) {
  const response = await fetch(`${STRAPI_URL}/api/categories/${documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { cover_image: coverId } }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update category ${documentId}: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function extensionFromUrl(url, fallback = '.jpg') {
  const pathname = new URL(url).pathname;
  const extension = extname(pathname);
  return extension && extension.length <= 5 ? extension : fallback;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Building category map from ${CATEGORY_INDEX_URL} ...`);
  const { map, count } = await buildPornDiscountsCategoryMap();
  console.log(`Indexed ${count} source categories.\n`);

  console.log('Fetching categories from Strapi...');
  const categories = await fetchCategories();
  console.log(`Found ${categories.length} category/categories to process.\n`);

  if (categories.length === 0) {
    console.log('No matching categories found.');
    return;
  }

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  const noMatch = [];
  const failures = [];

  for (const category of categories) {
    if (category.cover_image && !forceMode) {
      console.log(`⏭  ${category.name} — cover image already exists, skipping (use --force to overwrite)`);
      skipped += 1;
      continue;
    }

    console.log(`🖼️  ${category.name} (${category.slug})`);
    processed += 1;

    const imageUrl = resolveCategoryImage(map, category.slug, category.name);
    if (!imageUrl) {
      console.log('  ✗ No matching source category found\n');
      noMatch.push(`${category.name} (${category.slug})`);
      continue;
    }

    console.log(`  ↳ Source image: ${imageUrl}`);

    if (dryRun) {
      console.log('  · dry-run, not uploading\n');
      continue;
    }

    try {
      const extension = extensionFromUrl(imageUrl);
      const fileName = `${category.slug}-cover${extension}`;
      const coverId = await uploadImage(imageUrl, fileName);
      if (!coverId) {
        console.log('  ✗ Cover upload failed\n');
        failures.push(`${category.name}: cover upload failed`);
        continue;
      }

      await updateCategoryCover(category.documentId, coverId);
      updated += 1;
      console.log('  💾 Saved cover image\n');
    } catch (error) {
      failures.push(`${category.name}: ${error.message}`);
      console.log(`  ✗ Error: ${error.message}\n`);
    }
  }

  console.log('\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Processed: ${processed} | Updated: ${updated} | Skipped: ${skipped} | No match: ${noMatch.length}`);
  if (noMatch.length > 0) {
    console.log(`\nⓘ No source category for: ${noMatch.join(', ')}`);
  }
  if (failures.length > 0) {
    console.log(`\n⚠ Failures: ${failures.join(', ')}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
