#!/usr/bin/env node
/**
 * import-site-gallery-from-source.mjs
 *
 * Imports site gallery images into the Strapi `gallery` media field.
 * For now, only DiscountedPorn is supported as the source.
 *
 * Usage:
 *   node scripts/import-site-gallery-from-source.mjs [options] [slug1 slug2 ...]
 *
 * Options:
 *   --all             Process all active sites
 *   --force           Overwrite existing gallery media assignments
 *   --site=slug       Process a single site slug
 *   --sites=a,b       Process a comma-separated list of site slugs
 *   --source=name     Source to use. Currently only `discountedporn` is supported.
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

let discountedPornDealMapPromise;

async function getDiscountedPornDealMap() {
  if (!discountedPornDealMapPromise) {
    discountedPornDealMapPromise = fetch('https://www.discountedporn.com/sitemap.xml')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch DiscountedPorn sitemap: ${response.status}`);
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
          if (parts[0] !== 'deal' || !parts[1]) continue;
          map.set(toNoHyphen(parts[1]), loc);
        }
        return map;
      });
  }

  return discountedPornDealMapPromise;
}

const SUPPORTED_SOURCES = new Map([
  ['discountedporn', 'DiscountedPorn'],
  ['discountedporncom', 'DiscountedPorn'],
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
  console.error('Usage: node scripts/import-site-gallery-from-source.mjs [--all | slug1 slug2 ... | --site=slug | --sites=a,b] [--force] [--source=discountedporn]');
  process.exit(1);
}

const sourceName = requestedSourceKeys.length === 0
  ? 'DiscountedPorn'
  : SUPPORTED_SOURCES.get(requestedSourceKeys[0]);

if (!sourceName || requestedSourceKeys.length > 1) {
  console.error('Only one source is supported for now: DiscountedPorn');
  process.exit(1);
}

for (const key of requestedSourceKeys) {
  if (!SUPPORTED_SOURCES.has(key)) {
    console.error(`Unknown source: ${key}. Supported: discountedporn`);
    process.exit(1);
  }
}

async function fetchSites() {
  const allSites = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const params = new URLSearchParams({
      'populate[0]': 'gallery',
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

async function updateSiteGallery(documentId, galleryIds) {
  const response = await fetch(`${STRAPI_URL}/api/sites/${documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { gallery: galleryIds } }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update site ${documentId}: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function resolveDiscountedPornUrl(site) {
  const existing = (site.reviewSources ?? []).find((source) => source.sourceName === 'DiscountedPorn');
  if (existing?.sourceUrl) return existing.sourceUrl;

  const dealMap = await getDiscountedPornDealMap();
  for (const variant of slugVariants(site.slug, site.name, site.platform?.name || null)) {
    const match = dealMap.get(toNoHyphen(variant));
    if (match) return match;
  }

  return null;
}

async function extractDiscountedPornImages(page, dealUrl) {
  await page.goto(dealUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  return page.evaluate(() => {
    const toAbsolute = (value) => {
      if (!value) return null;
      try {
        return new URL(value, window.location.href).toString();
      } catch {
        return null;
      }
    };

    const nodes = [
      ...document.querySelectorAll('.media-wrapper img'),
      ...document.querySelectorAll('.media-wrapper + .row img'),
    ];

    const urls = [];
    for (const node of nodes) {
      const value = node.getAttribute('data-src') || node.getAttribute('src');
      const absolute = toAbsolute(value);
      if (!absolute) continue;
      if (absolute.includes('lazy-placeholder')) continue;
      urls.push(absolute);
    }

    return [...new Set(urls)];
  });
}

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
    const existingGallery = site.gallery ?? [];

    if (existingGallery.length > 0 && !forceMode) {
      console.log(`⏭  ${site.name} — gallery already has ${existingGallery.length} image(s), skipping (use --force to overwrite)`);
      skipped += 1;
      continue;
    }

    console.log(`🖼️  ${site.name} (${site.slug})`);

    try {
      const dealUrl = await resolveDiscountedPornUrl(site);
      if (!dealUrl) {
        console.log('  ✗ DiscountedPorn URL not found\n');
        failures.push(`${site.name}: missing DiscountedPorn deal URL`);
        processed += 1;
        continue;
      }

      console.log(`  ↳ Source: ${dealUrl}`);
      const imageUrls = await extractDiscountedPornImages(page, dealUrl);
      if (imageUrls.length === 0) {
        console.log('  ✗ No gallery images found on source page\n');
        failures.push(`${site.name}: no images on source page`);
        processed += 1;
        continue;
      }

      const galleryIds = [];
      for (let index = 0; index < imageUrls.length; index += 1) {
        const imageUrl = imageUrls[index];
        const extension = extensionFromUrl(imageUrl);
        const fileName = `${site.slug}-gallery-${index + 1}${extension}`;
        const uploadedId = await uploadImage(imageUrl, fileName);
        if (uploadedId) galleryIds.push(uploadedId);
      }

      if (galleryIds.length === 0) {
        console.log('  ✗ Upload failed for all gallery images\n');
        failures.push(`${site.name}: uploads failed`);
        processed += 1;
        continue;
      }

      await updateSiteGallery(site.documentId, galleryIds);
      updated += 1;
      processed += 1;
      console.log(`  💾 Saved ${galleryIds.length} gallery image(s)\n`);
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