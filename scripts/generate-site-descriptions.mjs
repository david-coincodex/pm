#!/usr/bin/env node
/**
 * generate-site-descriptions.mjs
 *
 * Uses GPT-5.5 to generate site descriptions, short taglines, and feature lists
 * from existing review content. Saves to Strapi site records.
 *
 * Usage:
 *   node scripts/generate-site-descriptions.mjs [options] [slug1 slug2 ...]
 *
 * Options:
 *   --all               Process all active sites
 *   --short-description Generate only short_description field
 *   --included          Generate only included field
 *   --force             Overwrite existing field values (default: skip if populated)
 *
 * Examples:
 *   node scripts/generate-site-descriptions.mjs --all
 *   node scripts/generate-site-descriptions.mjs --all --short-description --force
 *   node scripts/generate-site-descriptions.mjs --included slug1 slug2
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
dotenv.config({ path: `${__dirname}/.env`, quiet: true });

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
const DESCRIPTION_PROMPT = readFileSync(join(__dirname, 'site-description-prompt.md'), 'utf-8');
const SHORT_DESCRIPTION_PROMPT = readFileSync(join(__dirname, 'site-short-description-prompt.md'), 'utf-8');
const INCLUDED_PROMPT = readFileSync(join(__dirname, 'site-included-prompt.md'), 'utf-8');

// ── CLI Parsing ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const forceMode = args.includes('--force');
const allMode = args.includes('--all');
const descriptionFlag = args.includes('--description');
const shortDescriptionFlag = args.includes('--short-description');
const includedFlag = args.includes('--included');
const slugs = args.filter((a) => !a.startsWith('--'));

const anyFieldFlag = descriptionFlag || shortDescriptionFlag || includedFlag;

/**
 * Which fields to generate.
 *
 * `description` is opt-in via --description, deliberately NOT part of the no-flags default: it is
 * the most expensive field (full 200-word body per site) and adding it to the default would make
 * every existing `--all` run several times costlier without the caller asking for it.
 */
const fieldsToGenerate = {
  description: descriptionFlag,
  shortDescription: shortDescriptionFlag || !anyFieldFlag,
  included: includedFlag || !anyFieldFlag,
};

if (!allMode && slugs.length === 0) {
  console.error('Usage: node scripts/generate-site-descriptions.mjs [--all | slug1 slug2 ...] [--description | --short-description | --included] [--force]');
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

async function fetchParentSite(siteDocumentId) {
  const res = await fetch(
    `${STRAPI_URL}/api/sites/${siteDocumentId}?populate=parent_site`,
    { headers }
  );
  if (!res.ok) return null;
  const { data } = await res.json();
  return data?.parent_site ?? null;
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

async function updateSiteFields(documentId, fields) {
  const res = await fetch(`${STRAPI_URL}/api/sites/${documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: fields }),
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
      { role: 'system', content: DESCRIPTION_PROMPT },
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

async function generateShortDescription(site, fullDescription, reviewContent, retries = 3) {
  if (!fullDescription && !reviewContent) throw new Error('Description or review content is required');

  let userPrompt = `## Site: ${site.name}\n`;
  if (fullDescription) {
    userPrompt += `\n## Full Description:\n${fullDescription}`;
  }
  if (reviewContent) {
    userPrompt += `\n## Review Highlights:\n${reviewContent}`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.5',
      messages: [
        { role: 'system', content: SHORT_DESCRIPTION_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_completion_tokens: 500,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw || raw.trim().length === 0) {
      // If content is filtered/empty, retry with delays
      const finishReason = response.choices[0]?.finish_reason;
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 2000));
        return generateShortDescription(site, fullDescription, reviewContent, retries - 1);
      }
      throw new Error(`Empty response from GPT-5.5 (finish_reason: ${finishReason})`);
    }

    return raw.trim().slice(0, 160);
  } catch (err) {
    if (retries > 0 && err.status === 429) {
      const delay = Math.pow(2, 4 - retries) * 1000; // Exponential backoff: 8s, 4s, 2s
      console.log(`   ⏳ Rate limited, waiting ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      return generateShortDescription(site, fullDescription, reviewContent, retries - 1);
    }
    throw err;
  }
}

async function generateIncluded(site, fullDescription, reviewContent, retries = 3) {
  if (!fullDescription && !reviewContent) throw new Error('Description or review content is required');

  let context = `## Site: ${site.name}\n`;
  if (fullDescription) {
    context += `### Full Description:\n${fullDescription}\n\n`;
  }
  if (reviewContent) {
    context += `### Review Content:\n${reviewContent}`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.5',
      messages: [
        { role: 'system', content: INCLUDED_PROMPT },
        { role: 'user', content: context },
      ],
      max_completion_tokens: 500,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw || raw.trim().length === 0) {
      // If content is filtered/empty, retry with delays
      const finishReason = response.choices[0]?.finish_reason;
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 2000));
        return generateIncluded(site, fullDescription, reviewContent, retries - 1);
      }
      throw new Error(`Empty response from GPT-5.5 (finish_reason: ${finishReason})`);
    }

    return raw.trim();
  } catch (err) {
    if (retries > 0 && err.status === 429) {
      const delay = Math.pow(2, 4 - retries) * 1000; // Exponential backoff: 8s, 4s, 2s
      console.log(`   ⏳ Rate limited, waiting ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      return generateIncluded(site, fullDescription, reviewContent, retries - 1);
    }
    throw err;
  }
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
  let skippedMissingReview = 0;
  let skippedParentSite = 0;
  const fieldStats = {
    description: 0,
    shortDescription: 0,
    included: 0,
  };
  const errors = [];

  for (const site of sites) {
    let fieldsToUpdate = {};
    let generatedFields = [];

    // Fetch parent site to check if this is a sub-site
    const parentSite = await fetchParentSite(site.documentId);

    // Check which fields need generation
    const needsDescription = fieldsToGenerate.description && (forceMode || !site.description);
    const needsShortDescription = fieldsToGenerate.shortDescription && (forceMode || !site.short_description);
    const needsIncluded = fieldsToGenerate.included && (forceMode || !site.included) && !parentSite;

    if (!needsDescription && !needsShortDescription && !needsIncluded) {
      console.log(`⏭  ${site.name} — all target fields populated, skipping`);
      skipped++;
      continue;
    }

    // Fetch review content (needed for generation)
    const review = await fetchReviewForSite(site.documentId);
    if (!review || !review.content) {
      console.log(`⏭  ${site.name} — no review found, skipping`);
      skipped++;
      skippedMissingReview++;
      continue;
    }

    // Check parent site constraint for included
    if (needsIncluded && parentSite) {
      console.log(`⏭  ${site.name} — has parent_site, skipping included generation`);
      skipped++;
      skippedParentSite++;
      continue;
    }

    console.log(`🤖 ${site.name} (${site.slug}) — generating fields...`);
    processed++;

    try {
      // Generate description FIRST: short_description is written from the full description, so
      // generating in this order lets a freshly written body feed the tagline in the same pass
      // (otherwise the tagline is derived from review content alone and reads less on-message).
      let description = site.description;
      if (needsDescription) {
        console.log(`   • Generating description...`);
        description = await generateDescription(site, review.content);
        fieldsToUpdate.description = description;
        generatedFields.push('description');
        fieldStats.description++;
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Generate short_description if needed
      if (needsShortDescription) {
        console.log(`   • Generating short_description...`);
        const shortDesc = await generateShortDescription(site, description, review.content);
        fieldsToUpdate.short_description = shortDesc;
        generatedFields.push('short_description');
        fieldStats.shortDescription++;
        // Delay between field generations to avoid rate limits
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Generate included if needed
      if (needsIncluded) {
        console.log(`   • Generating included...`);
        const included = await generateIncluded(site, site.description, review.content);
        fieldsToUpdate.included = included;
        generatedFields.push('included');
        fieldStats.included++;
      }

      // Update site with generated fields
      await updateSiteFields(site.documentId, fieldsToUpdate);
      updated++;

      console.log(`  ✓ Updated: ${generatedFields.join(', ')}\n`);
    } catch (err) {
      errors.push({ site: site.name, error: err.message });
      console.error(`  ✗ Error for ${site.name}: ${err.message}\n`);
    }

    // Rate limiting - increase delays to handle rate limits better
    await new Promise((r) => setTimeout(r, 5000));
  }

  // Summary
  console.log('\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Processed: ${processed} | Updated: ${updated} | Skipped: ${skipped}`);
  if (skippedMissingReview > 0) {
    console.log(`Skipped due to missing review: ${skippedMissingReview}`);
  }
  if (skippedParentSite > 0) {
    console.log(`Skipped due to parent_site (included): ${skippedParentSite}`);
  }
  if (updated > 0) {
    console.log(`\nFields generated:`);
    if (fieldStats.description > 0) {
      console.log(`  • description: ${fieldStats.description}`);
    }
    if (fieldStats.shortDescription > 0) {
      console.log(`  • short_description: ${fieldStats.shortDescription}`);
    }
    if (fieldStats.included > 0) {
      console.log(`  • included: ${fieldStats.included}`);
    }
  }

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
