#!/usr/bin/env node
/**
 * generate-site-descriptions.mjs
 *
 * Uses GPT-5.5 to generate concise site descriptions (~200 words) from
 * existing review content. Saves to the site's `description` field in Strapi.
 *
 * Usage:
 *   node scripts/generate-site-descriptions.mjs [options] [slug1 slug2 ...]
 *
 * Options:
 *   --all       Process all active sites
 *   --force     Overwrite existing descriptions (default: skip sites with descriptions)
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

const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: `${__dirname}/.env` });

// ── Config ─────────────────────────────────────────────────────────────────────

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
const SYSTEM_PROMPT = readFileSync(join(__dirname, 'site-description-prompt.md'), 'utf-8');

// ── CLI Parsing ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const forceMode = args.includes('--force');
const allMode = args.includes('--all');
const slugs = args.filter((a) => !a.startsWith('--'));

if (!allMode && slugs.length === 0) {
  console.error('Usage: node scripts/generate-site-descriptions.mjs [--all | slug1 slug2 ...] [--force]');
  process.exit(1);
}

// ── Strapi Helpers ─────────────────────────────────────────────────────────────

async function fetchSites() {
  let page = 1;
  const pageSize = 100;
  const allSites = [];

  while (true) {
    const params = new URLSearchParams({
      'filters[isActive][$eq]': 'true',
      'pagination[page]': String(page),
      'pagination[pageSize]': String(pageSize),
    });

    if (!allMode && slugs.length > 0) {
      slugs.forEach((slug, i) => {
        params.append(`filters[$or][${i}][slug][$eq]`, slug);
      });
    }

    const res = await fetch(`${STRAPI_URL}/api/sites?${params}`, { headers });
    if (!res.ok) throw new Error(`Failed to fetch sites page ${page}: ${res.status} ${await res.text()}`);

    const { data, meta } = await res.json();
    allSites.push(...data);

    if (page >= (meta?.pagination?.pageCount ?? 1)) break;
    page++;
  }

  return allSites;
}

async function fetchReviewForSite(siteDocumentId) {
  const res = await fetch(
    `${STRAPI_URL}/api/reviews?filters[site][documentId][$eq]=${siteDocumentId}&pagination[pageSize]=1`,
    { headers }
  );
  if (!res.ok) return null;
  const { data } = await res.json();
  return data[0] ?? null;
}

async function updateSiteDescription(documentId, description) {
  const res = await fetch(`${STRAPI_URL}/api/sites/${documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { description } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update site: ${res.status} ${text}`);
  }
  return res.json();
}

// ── Description Generation ─────────────────────────────────────────────────────

async function generateDescription(site, reviewContent) {
  let userPrompt = `## Site: ${site.name}\n`;
  userPrompt += `- **URL**: ${site.url}\n`;
  userPrompt += `- **Type**: ${site.siteType}\n`;
  if (site.short_description) userPrompt += `- **Tagline**: ${site.short_description}\n`;
  userPrompt += `\n## Review Content\n${reviewContent}\n`;
  userPrompt += `\nWrite a site description (max 200 words) for "${site.name}" based on the review above.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-5.5',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: 1000,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('No response from GPT-5.5');

  // Strip any markdown code fences if GPT wraps output
  let html = raw.trim();
  if (html.startsWith('```')) {
    html = html.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  return html;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching sites from Strapi...');
  const sites = await fetchSites();
  console.log(`Found ${sites.length} site(s) to process.\n`);

  if (sites.length === 0) {
    console.log('No matching sites found.');
    return;
  }

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const site of sites) {
    // Skip if description already exists (unless --force)
    if (site.description && !forceMode) {
      console.log(`⏭  ${site.name} — description exists, skipping (use --force to overwrite)`);
      skipped++;
      continue;
    }

    // Fetch review content
    const review = await fetchReviewForSite(site.documentId);
    if (!review || !review.content) {
      console.log(`⏭  ${site.name} — no review found, skipping`);
      skipped++;
      continue;
    }

    console.log(`🤖 ${site.name} (${site.slug}) — generating description...`);
    processed++;

    try {
      const description = await generateDescription(site, review.content);
      await updateSiteDescription(site.documentId, description);
      updated++;

      const wordCount = description.replace(/<[^>]+>/g, '').split(/\s+/).length;
      console.log(`  ✓ Saved (${wordCount} words)\n`);
    } catch (err) {
      errors.push({ site: site.name, error: err.message });
      console.error(`  ✗ Error for ${site.name}: ${err.message}\n`);
    }

    // Rate limiting
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Summary
  console.log('\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Processed: ${processed} | Updated: ${updated} | Skipped: ${skipped}`);

  if (errors.length > 0) {
    console.log(`\n✗ Errors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  • ${e.site}: ${e.error}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
