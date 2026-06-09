#!/usr/bin/env node
/**
 * import-site-cover-from-source.mjs
 *
 * Imports site cover images into the Strapi `cover_image` media field.
 * For now, only PornDiscounts is supported as the source.
 *
 * Usage:
 *   node scripts/import-site-cover-from-source.mjs [options] [slug1 slug2 ...]
 *
 * Options:
 *   --all             Process all active sites
 *   --force           Overwrite existing cover image assignments
 *   --site=slug       Process a single site slug
 *   --sites=a,b       Process a comma-separated list of site slugs
 *   --source=name     Source to use. Currently only `porndiscounts` is supported.
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

require('dotenv').config({ path: `${__dirname}/.env` });

import { chromium } from 'playwright';

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;

if (!TOKEN) {
  console.error('Error: STRAPI_TOKEN is required.');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};

const sourceKey = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const toNoHyphen = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const toHyphen = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function splitVariants(value) {
  const out = [];
  for (let index = 2; index <= value.length - 2; index += 1) {
    out.push(`${value.slice(0, index)}-${value.slice(index)}`);
  }
  return out;
}

function slugVariants(slug, name, networkName) {
  const noHyphenSlug = toNoHyphen(slug);
  const noHyphenName = toNoHyphen(name);
  const variants = new Set([
    slug,
    noHyphenSlug,
    noHyphenName,
    toHyphen(name),
    slug.replace(/-/g, ''),
    `${noHyphenSlug}com`,
    `${slug}com`,
    `${slug}-network`,
    `${noHyphenSlug}-network`,
  ]);

  if (!slug.includes('-')) {
    for (const variant of splitVariants(noHyphenSlug)) variants.add(variant);
  }

  if (noHyphenName !== noHyphenSlug && name.includes(' ')) {
    for (const variant of splitVariants(noHyphenName)) variants.add(variant);
  }

  if (networkName) {
    variants.add(toNoHyphen(networkName));
    variants.add(toHyphen(networkName));
  }

  return [...variants];
}

let pornDiscountsMapPromise;

async function getPornDiscountsMap() {
  if (!pornDiscountsMapPromise) {
    pornDiscountsMapPromise = fetch('https://www.porndiscounts.com/sitemap-discounts-discounts.xml')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch PornDiscounts sitemap: ${response.status}`);
        }
        return response.text();
      })
      .then((xml) => {
        const map = new Map();
        for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
          const loc = match[1];
          let pathname;
          try {
            pathname = new URL(loc).pathname;
          } catch {
            continue;
          }

          const parts = pathname.split('/').filter(Boolean);
          if (parts[0] !== 'porn-discounts' || !parts[1]) continue;

          const tail = parts.at(-1);
          if (!tail) continue;

          map.set(toNoHyphen(tail), loc);
          if (parts.length === 2) {
            map.set(toNoHyphen(parts[1]), loc);
          }
        }
        return map;
      });
  }

  return pornDiscountsMapPromise;
}

let pornDealsMapPromise;

async function getPornDealsMap() {
  if (!pornDealsMapPromise) {
    pornDealsMapPromise = fetch('https://porndeals.com/sitemap.xml')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch PornDeals sitemap: ${response.status}`);
        }
        return response.text();
      })
      .then((xml) => {
        const map = new Map();
        for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
          const loc = match[1];
          let pathname;
          try {
            pathname = new URL(loc).pathname;
          } catch {
            continue;
          }

          const parts = pathname.split('/').filter(Boolean);
          if (parts[0] !== 'reviews' || !parts[1]) continue;

          map.set(toNoHyphen(parts[1]), loc);
          // Many entries carry a "-network" suffix; index the bare slug too.
          map.set(toNoHyphen(parts[1].replace(/-network$/, '')), loc);
        }
        return map;
      });
  }

  return pornDealsMapPromise;
}

let pornDealsDiscountMapPromise;

async function getPornDealsDiscountMap() {
  if (!pornDealsDiscountMapPromise) {
    pornDealsDiscountMapPromise = fetch('https://porndeals.com/sitemap.xml')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch PornDeals sitemap: ${response.status}`);
        }
        return response.text();
      })
      .then((xml) => {
        const map = new Map();
        for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
          const loc = match[1];
          let parts;
          try {
            parts = new URL(loc).pathname.split('/').filter(Boolean);
          } catch {
            continue;
          }

          // Discount pages are /<network>/<sub-site>/ — index by the sub-site (last) segment.
          if (parts.length !== 2) continue;
          if (parts[0] === 'blog' || parts[0] === 'reviews') continue;

          map.set(toNoHyphen(parts[1]), loc);
        }
        return map;
      });
  }

  return pornDealsDiscountMapPromise;
}

const SUPPORTED_SOURCES = new Map([
  ['porndiscounts', 'PornDiscounts'],
  ['porndiscountscom', 'PornDiscounts'],
  ['porndeals', 'PornDeals'],
  ['porndealscom', 'PornDeals'],
]);

const args = process.argv.slice(2);
const forceMode = args.includes('--force');
const allMode = args.includes('--all');
const requestedSourceKeys = args
  .filter((arg) => arg.startsWith('--source='))
  .flatMap((arg) => arg.split('=')[1]?.split(',') ?? [])
  .map((arg) => sourceKey(arg.trim()))
  .filter(Boolean);
const cliSiteArgs = args
  .filter((arg) => arg.startsWith('--site=') || arg.startsWith('--sites='))
  .flatMap((arg) => arg.split('=')[1]?.split(',') ?? [])
  .map((arg) => arg.trim())
  .filter(Boolean);
const positionalSlugs = args.filter((arg) => !arg.startsWith('--'));
const slugs = [...new Set([...positionalSlugs, ...cliSiteArgs])];

if (allMode && slugs.length > 0) {
  console.error('Use either --all or an explicit site list, not both.');
  process.exit(1);
}

if (!allMode && slugs.length === 0) {
  console.error('Usage: node scripts/import-site-cover-from-source.mjs [--all | slug1 slug2 ... | --site=slug | --sites=a,b] [--force] [--source=porndiscounts]');
  process.exit(1);
}

const sourceName = requestedSourceKeys.length === 0
  ? 'PornDiscounts'
  : SUPPORTED_SOURCES.get(requestedSourceKeys[0]);

if (!sourceName || requestedSourceKeys.length > 1) {
  console.error('Only one source can be used per run. Supported: porndiscounts, porndeals');
  process.exit(1);
}

for (const key of requestedSourceKeys) {
  if (!SUPPORTED_SOURCES.has(key)) {
    console.error(`Unknown source: ${key}. Supported: porndiscounts, porndeals`);
    process.exit(1);
  }
}

async function fetchSites() {
  const allSites = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const params = new URLSearchParams({
      'populate[0]': 'cover_image',
      'populate[1]': 'reviewSources',
      'populate[2]': 'platform',
      'filters[isActive][$eq]': 'true',
      'pagination[page]': String(page),
      'pagination[pageSize]': String(pageSize),
    });

    if (!allMode && slugs.length > 0) {
      slugs.forEach((slug, index) => {
        params.append(`filters[$or][${index}][slug][$eq]`, slug);
      });
    }

    const response = await fetch(`${STRAPI_URL}/api/sites?${params}`, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch sites page ${page}: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    allSites.push(...payload.data);

    if (page >= (payload.meta?.pagination?.pageCount ?? 1)) break;
    page += 1;
  }

  return allSites;
}

async function uploadImage(imageUrl, filename) {
  const response = await fetch(imageUrl);
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

async function updateSiteCover(documentId, coverId) {
  const response = await fetch(`${STRAPI_URL}/api/sites/${documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { cover_image: coverId } }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update site ${documentId}: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function resolvePornDiscountsUrl(site) {
  const existing = (site.reviewSources ?? []).find((source) => source.sourceName === 'PornDiscounts');
  if (existing?.sourceUrl) return existing.sourceUrl;

  const discountMap = await getPornDiscountsMap();
  for (const variant of slugVariants(site.slug, site.name, site.platform?.name || null)) {
    const match = discountMap.get(toNoHyphen(variant));
    if (match) return match;
  }

  return null;
}

async function extractPornDiscountsCover(page, reviewUrl) {
  await page.goto(reviewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  return page.evaluate(() => {
    const node = document.querySelector('.discount-thumb img');
    if (!node) return null;

    const value = node.getAttribute('data-src') || node.getAttribute('src');
    if (!value) return null;

    try {
      return new URL(value, window.location.href).toString();
    } catch {
      return null;
    }
  });
}

async function resolvePornDealsUrl(site) {
  const existing = (site.reviewSources ?? []).find((source) => source.sourceName === 'PornDeals');
  if (existing?.sourceUrl) return existing.sourceUrl;

  const variants = slugVariants(site.slug, site.name, site.platform?.name || null);

  // Prefer a top-level review page, then fall back to the sub-site discount page.
  const dealMap = await getPornDealsMap();
  for (const variant of variants) {
    const match = dealMap.get(toNoHyphen(variant));
    if (match) return match;
  }

  const discountMap = await getPornDealsDiscountMap();
  for (const variant of variants) {
    const match = discountMap.get(toNoHyphen(variant));
    if (match) return match;
  }

  return null;
}

async function extractPornDealsCover(page, reviewUrl) {
  await page.goto(reviewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  return page.evaluate(() => {
    // Hero cover lives in the review header (.dc-review-header) or, on discount
    // pages, in .deal-cover. Lazy-loaded — the high-res URL is in data-src.
    const node = document.querySelector('.dc-review-header img, .deal-cover img');
    if (!node) return null;

    const value = node.getAttribute('data-src') || node.getAttribute('src');
    if (!value) return null;

    try {
      return new URL(value, window.location.href).toString();
    } catch {
      return null;
    }
  });
}

const RESOLVERS = {
  PornDiscounts: resolvePornDiscountsUrl,
  PornDeals: resolvePornDealsUrl,
};

const EXTRACTORS = {
  PornDiscounts: extractPornDiscountsCover,
  PornDeals: extractPornDealsCover,
};

function extensionFromUrl(url, fallback = '.jpg') {
  const pathname = new URL(url).pathname;
  const extension = extname(pathname);
  return extension && extension.length <= 5 ? extension : fallback;
}

async function main() {
  console.log('Fetching sites from Strapi...');
  const sites = await fetchSites();
  console.log(`Found ${sites.length} site(s) to process.\n`);

  if (sites.length === 0) {
    console.log('No matching sites found.');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const page = await context.newPage();

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  const failures = [];

  for (const site of sites) {
    const existingCover = site.cover_image;

    if (existingCover && !forceMode) {
      console.log(`⏭  ${site.name} — cover image already exists, skipping (use --force to overwrite)`);
      skipped += 1;
      continue;
    }

    console.log(`🖼️  ${site.name} (${site.slug})`);

    try {
      const reviewUrl = await RESOLVERS[sourceName](site);
      if (!reviewUrl) {
        console.log(`  ✗ ${sourceName} URL not found\n`);
        failures.push(`${site.name}: missing ${sourceName} URL`);
        processed += 1;
        continue;
      }

      console.log(`  ↳ Source: ${reviewUrl}`);
      const imageUrl = await EXTRACTORS[sourceName](page, reviewUrl);
      if (!imageUrl) {
        console.log('  ✗ Cover image not found on source page\n');
        failures.push(`${site.name}: no cover image on source page`);
        processed += 1;
        continue;
      }

      const extension = extensionFromUrl(imageUrl);
      const fileName = `${site.slug}-cover${extension}`;
      const coverId = await uploadImage(imageUrl, fileName);
      if (!coverId) {
        console.log('  ✗ Cover upload failed\n');
        failures.push(`${site.name}: cover upload failed`);
        processed += 1;
        continue;
      }

      await updateSiteCover(site.documentId, coverId);
      updated += 1;
      processed += 1;
      console.log('  💾 Saved cover image\n');
    } catch (error) {
      processed += 1;
      failures.push(`${site.name}: ${error.message}`);
      console.log(`  ✗ Error: ${error.message}\n`);
    }
  }

  await browser.close();

  console.log('\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Processed: ${processed} | Updated: ${updated} | Skipped: ${skipped}`);
  if (failures.length > 0) {
    console.log(`\n⚠ Failures: ${failures.join(', ')}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});