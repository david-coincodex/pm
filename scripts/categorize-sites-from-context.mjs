#!/usr/bin/env node
/**
 * categorize-sites-from-context.mjs
 *
 * Uses GPT-5.5 to assign existing site categories based on each site's
 * externalContext field. Updates the Strapi site record with the selected
 * category relations.
 *
 * Usage:
 *   node scripts/categorize-sites-from-context.mjs [options] [slug1 slug2 ...]
 *
 * Options:
 *   --all                  Process all sites
 *   --force                Replace any existing site categories
 *   --sites=slug1,slug2    Comma-separated list of site slugs to process
 *
 * Examples:
 *   node scripts/categorize-sites-from-context.mjs --all
 *   node scripts/categorize-sites-from-context.mjs --all --force
 *   node scripts/categorize-sites-from-context.mjs --sites=brazzers,mofos
 *   node scripts/categorize-sites-from-context.mjs brazzers mofos
 *
 * Environment:
 *   STRAPI_URL      (default: http://localhost:1339)
 *   STRAPI_TOKEN    API token for Strapi
 *   OPENAI_API_KEY  OpenAI API key
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');

dotenv.config({ path: `${__dirname}/.env`, quiet: true });

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 90000);

if (!TOKEN) {
  console.error('Error: STRAPI_TOKEN is required.');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY is required.');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const CATEGORY_PROMPT = readFileSync(join(__dirname, 'categorize-sites-from-context-prompt.md'), 'utf-8');

const args = process.argv.slice(2);
const allMode = args.includes('--all');
const forceMode = args.includes('--force');
const explicitSites = args
  .filter((arg) => arg.startsWith('--sites='))
  .flatMap((arg) => arg.slice('--sites='.length).split(','))
  .map((slug) => slug.trim())
  .filter(Boolean);
const positionalSlugs = args.filter((arg) => !arg.startsWith('--'));
const requestedSlugs = [...new Set([...explicitSites, ...positionalSlugs])];

if (!allMode && requestedSlugs.length === 0) {
  console.error('Usage: node scripts/categorize-sites-from-context.mjs [--all | --sites=slug1,slug2 | slug1 slug2 ...] [--force]');
  process.exit(1);
}

if (allMode && requestedSlugs.length > 0) {
  console.error('Error: Use either --all or an explicit site list, not both.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRequestTimeoutError(timeoutMs) {
  const error = new Error(`OpenAI request timed out after ${timeoutMs}ms`);
  error.name = 'RequestTimeoutError';
  return error;
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(createRequestTimeoutError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function truncateText(value, maxLength) {
  if (!value) return '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n... [truncated]`;
}

function extractJsonObject(text) {
  const trimmed = text.trim();
  const withoutFence = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    : trimmed;

  return JSON.parse(withoutFence);
}

function incrementCounter(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

function formatCategoryList(categories) {
  return categories
    .map((category) => {
      const description = category.description?.trim();
      return description
        ? `- ${category.name} (${category.slug}): ${description}`
        : `- ${category.name} (${category.slug})`;
    })
    .join('\n');
}

async function fetchAllCategories() {
  let page = 1;
  const pageSize = 100;
  const categories = [];

  while (true) {
    const params = new URLSearchParams({
      'pagination[page]': String(page),
      'pagination[pageSize]': String(pageSize),
      sort: 'name:asc',
    });

    const res = await fetch(`${STRAPI_URL}/api/categories?${params}`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch categories page ${page}: ${res.status} ${await res.text()}`);
    }

    const { data, meta } = await res.json();
    categories.push(...data);

    if (page >= (meta?.pagination?.pageCount ?? 1)) break;
    page += 1;
  }

  return categories;
}

async function fetchSites() {
  let page = 1;
  const pageSize = 100;
  const sites = [];

  while (true) {
    const params = new URLSearchParams({
      'populate[0]': 'categories',
      'pagination[page]': String(page),
      'pagination[pageSize]': String(pageSize),
      sort: 'name:asc',
    });

    if (!allMode && requestedSlugs.length > 0) {
      requestedSlugs.forEach((slug, index) => {
        params.append(`filters[$or][${index}][slug][$eq]`, slug);
      });
    }

    const res = await fetch(`${STRAPI_URL}/api/sites?${params}`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch sites page ${page}: ${res.status} ${await res.text()}`);
    }

    const { data, meta } = await res.json();
    sites.push(...data);

    if (page >= (meta?.pagination?.pageCount ?? 1)) break;
    page += 1;
  }

  return sites;
}

async function updateSiteCategories(documentId, categoryDocumentIds) {
  const res = await fetch(`${STRAPI_URL}/api/sites/${documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      data: {
        categories: categoryDocumentIds,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to update site ${documentId}: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

async function categorizeSite(site, categories, categoryBySlug, retries = 3) {
  const contextPayload = truncateText(JSON.stringify(site.externalContext, null, 2), 18000);
  const categoryPayload = truncateText(formatCategoryList(categories), 8000);

  const userPrompt = [
    `## Site`,
    `- Name: ${site.name}`,
    `- Slug: ${site.slug}`,
    `- URL: ${site.url}`,
    site.siteType ? `- Type: ${site.siteType}` : null,
    '',
    '## Available Categories',
    categoryPayload,
    '',
    '## Site External Context',
    contextPayload,
  ].filter(Boolean).join('\n');

  try {
    console.log(`  Categorizing with GPT-5.5 (timeout: ${OPENAI_TIMEOUT_MS}ms)...`);
    const response = await withTimeout(
      openai.chat.completions.create({
        model: 'gpt-5.5',
        messages: [
          { role: 'system', content: CATEGORY_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: 600,
      }),
      OPENAI_TIMEOUT_MS
    );

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error('No response from GPT-5.5');
    }

    const parsed = extractJsonObject(raw);
    const selectedCategorySlugs = Array.isArray(parsed.selectedCategorySlugs)
      ? [...new Set(parsed.selectedCategorySlugs.map((slug) => String(slug).trim()).filter(Boolean))]
      : [];

    const validCategorySlugs = selectedCategorySlugs.filter((slug) => categoryBySlug.has(slug));

    return {
      selectedCategorySlugs: validCategorySlugs,
      invalidCategorySlugs: selectedCategorySlugs.filter((slug) => !categoryBySlug.has(slug)),
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.trim() : '',
      confidence: typeof parsed.confidence === 'string' ? parsed.confidence.trim() : '',
    };
  } catch (error) {
    if (retries > 0 && (error.status === 429 || error.status >= 500 || error.name === 'APIConnectionTimeoutError' || error.name === 'RequestTimeoutError')) {
      const delay = Math.pow(2, 4 - retries) * 1000;
      console.log(`   Rate limited or transient OpenAI error, retrying in ${delay}ms...`);
      await sleep(delay);
      return categorizeSite(site, categories, categoryBySlug, retries - 1);
    }

    throw error;
  }
}

async function main() {
  console.log(`Fetching categories from ${STRAPI_URL}...`);
  const categories = await fetchAllCategories();
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));

  if (categories.length === 0) {
    console.log('No categories found. Seed categories before running this script.');
    return;
  }

  console.log(`Fetched ${categories.length} categories.`);
  console.log(`Fetching sites${allMode ? '' : ` for ${requestedSlugs.length} requested slug(s)`}...\n`);

  const sites = await fetchSites();
  console.log(`Found ${sites.length} site(s) to process.\n`);

  if (sites.length === 0) {
    console.log('No matching sites found.');
    return;
  }

  const requestedSlugSet = new Set(requestedSlugs);
  const foundSlugSet = new Set(sites.map((site) => site.slug));
  const missingRequestedSlugs = requestedSlugs.filter((slug) => !foundSlugSet.has(slug));

  if (missingRequestedSlugs.length > 0) {
    console.log(`Missing requested site(s): ${missingRequestedSlugs.join(', ')}`);
    console.log();
  }

  const stats = {
    total: sites.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    skippedReasons: {},
  };

  const updates = [];

  for (const [index, site] of sites.entries()) {
    const existingCategories = Array.isArray(site.categories) ? site.categories : [];
    const existingCategoryDocumentIds = existingCategories
      .map((category) => category.documentId)
      .filter(Boolean);

    console.log(`[${index + 1}/${sites.length}] ${site.name} (${site.slug})`);

    if (!site.externalContext) {
      stats.skipped += 1;
      incrementCounter(stats.skippedReasons, 'no-externalContext');
      console.log('  Skipped: no externalContext.\n');
      continue;
    }

    if (!forceMode && existingCategoryDocumentIds.length > 0) {
      stats.skipped += 1;
      incrementCounter(stats.skippedReasons, 'already-has-categories');
      console.log(`  Skipped: already has ${existingCategoryDocumentIds.length} category relation(s). Use --force to replace them.\n`);
      continue;
    }

    let categorization;
    try {
      categorization = await categorizeSite(site, categories, categoryBySlug);
    } catch (error) {
      stats.failed += 1;
      console.log(`  Failed: ${error.message}\n`);
      continue;
    }

    if (categorization.invalidCategorySlugs.length > 0) {
      console.log(`  Ignored invalid category slug(s): ${categorization.invalidCategorySlugs.join(', ')}`);
    }

    if (categorization.selectedCategorySlugs.length === 0) {
      stats.skipped += 1;
      incrementCounter(stats.skippedReasons, 'no-relevant-categories');
      console.log('  Skipped: model did not find any relevant categories.');
      if (categorization.reasoning) {
        console.log(`  Reasoning: ${categorization.reasoning}`);
      }
      console.log();
      await sleep(1200);
      continue;
    }

    const selectedCategories = categorization.selectedCategorySlugs
      .map((slug) => categoryBySlug.get(slug))
      .filter(Boolean);
    const selectedCategoryDocumentIds = selectedCategories.map((category) => category.documentId);

    const nextCategoryDocumentIds = forceMode
      ? selectedCategoryDocumentIds
      : [...new Set([...existingCategoryDocumentIds, ...selectedCategoryDocumentIds])];

    const hasSameCategories =
      existingCategoryDocumentIds.length === nextCategoryDocumentIds.length &&
      existingCategoryDocumentIds.every((documentId) => nextCategoryDocumentIds.includes(documentId));

    if (hasSameCategories) {
      stats.skipped += 1;
      incrementCounter(stats.skippedReasons, 'unchanged');
      console.log('  Skipped: category assignment unchanged.');
      if (categorization.reasoning) {
        console.log(`  Reasoning: ${categorization.reasoning}`);
      }
      console.log();
      await sleep(1200);
      continue;
    }

    try {
      await updateSiteCategories(site.documentId, nextCategoryDocumentIds);
      stats.updated += 1;
      updates.push({
        slug: site.slug,
        categories: selectedCategories.map((category) => category.slug),
      });
      console.log(`  Updated: ${selectedCategories.map((category) => category.slug).join(', ')}`);
      if (categorization.reasoning) {
        console.log(`  Reasoning: ${categorization.reasoning}`);
      }
      console.log();
    } catch (error) {
      stats.failed += 1;
      console.log(`  Failed to update site: ${error.message}\n`);
    }

    await sleep(1200);
  }

  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total sites processed: ${stats.total}`);
  console.log(`Updated: ${stats.updated}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Failed: ${stats.failed}`);

  if (missingRequestedSlugs.length > 0) {
    console.log(`Requested but not found: ${missingRequestedSlugs.length}`);
  }

  const skippedReasonEntries = Object.entries(stats.skippedReasons);
  if (skippedReasonEntries.length > 0) {
    console.log('\nSkipped by reason:');
    for (const [reason, count] of skippedReasonEntries) {
      console.log(`- ${reason}: ${count}`);
    }
  }

  if (updates.length > 0) {
    console.log('\nUpdated sites:');
    for (const update of updates) {
      console.log(`- ${update.slug}: ${update.categories.join(', ')}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});