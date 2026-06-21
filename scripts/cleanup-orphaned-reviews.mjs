#!/usr/bin/env node
/**
 * cleanup-orphaned-reviews.mjs
 *
 * Finds review entries in Strapi that no longer have an attached site relation
 * and optionally deletes them.
 *
 * Usage:
 *   node scripts/cleanup-orphaned-reviews.mjs
 *   node scripts/cleanup-orphaned-reviews.mjs --apply
 *
 * Options:
 *   --apply     Delete orphaned reviews (default: dry run only)
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
dotenv.config({ path: `${__dirname}/.env`, quiet: true });

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

const args = process.argv.slice(2);
const applyMode = args.includes('--apply');

async function fetchReviews() {
  let page = 1;
  const pageSize = 100;
  const allReviews = [];

  while (true) {
    const params = new URLSearchParams({
      'populate[0]': 'site',
      'populate[1]': 'author',
      'pagination[page]': String(page),
      'pagination[pageSize]': String(pageSize),
      sort: 'publishDate:desc',
    });

    const res = await fetch(`${STRAPI_URL}/api/reviews?${params}`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch reviews page ${page}: ${res.status} ${await res.text()}`);
    }

    const { data, meta } = await res.json();
    allReviews.push(...data);

    if (page >= (meta?.pagination?.pageCount ?? 1)) break;
    page++;
  }

  return allReviews;
}

async function deleteReview(documentId) {
  const res = await fetch(`${STRAPI_URL}/api/reviews/${documentId}`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to delete review ${documentId}: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  console.log('Fetching reviews from Strapi...');
  const reviews = await fetchReviews();
  console.log(`Found ${reviews.length} review(s) total.`);

  const orphaned = reviews.filter((review) => !review.site);

  if (orphaned.length === 0) {
    console.log('No orphaned reviews found.');
    return;
  }

  console.log(`Found ${orphaned.length} orphaned review(s):\n`);
  for (const review of orphaned) {
    console.log(`- ${review.documentId} | locale=${review.locale || 'unknown'} | publishedAt=${review.publishedAt || 'draft'} | titleExtra=${review.titleExtra || 'n/a'}`);
  }

  if (!applyMode) {
    console.log('\nDry run only. Re-run with --apply to delete these orphaned reviews.');
    return;
  }

  let deleted = 0;
  for (const review of orphaned) {
    await deleteReview(review.documentId);
    deleted++;
    console.log(`Deleted ${review.documentId}`);
  }

  console.log(`\nDeleted ${deleted} orphaned review(s).`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});