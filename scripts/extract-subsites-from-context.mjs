#!/usr/bin/env node
/**
 * extract-subsites-from-context.mjs
 *
 * Reads scrapedReviews (raw scraped content) from Strapi sites and uses GPT-4o
 * to extract any "included sites / bonus channels / network sites" mentioned by
 * reviewers. Compares findings against current DB child_sites and outputs a diff.
 *
 * Usage:
 *   node scripts/extract-subsites-from-context.mjs [options] [slug1 slug2 ...]
 *
 * Options:
 *   --all       Process all sites that have scrapedReviews
 *   --parents   Only process sites that are known parent networks
 *
 * Environment:
 *   STRAPI_URL      (default: http://localhost:1339)
 *   STRAPI_TOKEN    API token for Strapi
 *   OPENAI_API_KEY  OpenAI API key
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');
dotenv.config({ path: `${__dirname}/.env`, quiet: true });
import OpenAI from 'openai';

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TOKEN) { console.error('Error: STRAPI_TOKEN is required.'); process.exit(1); }
if (!OPENAI_API_KEY) { console.error('Error: OPENAI_API_KEY is required.'); process.exit(1); }

const headers = { Authorization: `Bearer ${TOKEN}` };
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ── CLI ────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const allMode = args.includes('--all');
const parentsOnly = args.includes('--parents');
const slugs = args.filter((a) => !a.startsWith('--'));

if (!allMode && !parentsOnly && slugs.length === 0) {
  console.error('Usage: node scripts/extract-subsites-from-context.mjs [--all | --parents | slug1 slug2 ...]');
  process.exit(1);
}

// ── Known parent site slugs (to filter when using --parents) ──────────────────
const KNOWN_PARENT_SLUGS = new Set([
  'bangbros', 'brazzers', 'mofos', 'reality-kings', 'team-skeet', 'adult-time',
  'fakehub', 'girlsway', 'new-sensations', 'bad-daddy-pov', 'analized',
  'thai-swinger', 'ladyboy-gold', 'devils-film', 'fetish-network', 'blowpass',
  'wankz', 'pornstar-platinum', 'puba', 'pornpros',
]);

// ── Strapi helpers ─────────────────────────────────────────────────────────────

async function fetchSites() {
  let page = 1;
  const pageSize = 100;
  const all = [];

  while (true) {
    const params = new URLSearchParams({
      'populate[0]': 'child_sites',
      'filters[isActive][$eq]': 'true',
      'pagination[page]': String(page),
      'pagination[pageSize]': String(pageSize),
    });

    if (!allMode && !parentsOnly && slugs.length > 0) {
      slugs.forEach((slug, i) => {
        params.append(`filters[$or][${i}][slug][$eq]`, slug);
      });
    }

    const res = await fetch(`${STRAPI_URL}/api/sites?${params}`, { headers });
    if (!res.ok) throw new Error(`fetchSites: ${res.status} ${await res.text()}`);
    const { data, meta } = await res.json();
    all.push(...data);
    if (page >= (meta?.pagination?.pageCount ?? 1)) break;
    page++;
  }

  // Filter: only sites with scrapedReviews
  const withContent = all.filter((s) => {
    const sources = s.scrapedReviews?.sources ?? [];
    return sources.some((src) => src.isValid && src.content);
  });

  // Filter by mode
  if (parentsOnly) return withContent.filter((s) => KNOWN_PARENT_SLUGS.has(s.slug));
  if (slugs.length > 0) return withContent.filter((s) => slugs.includes(s.slug));
  return withContent;
}

// ── GPT extraction ─────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are an expert at analysing adult website reviews.

Given scraped review text about an adult website NETWORK or subscription service, extract any mentions of:
- "included sites", "bonus sites", "network sites", "sister sites", "channels", "sub-sites"
- Individual site names that reviewers say are accessible with a subscription

Return ONLY a JSON object in this exact structure:
{
  "networkName": "The name of the main network/site being reviewed",
  "mentionedSubsites": [
    {
      "name": "Exact site name as mentioned in the review",
      "confidence": "high|medium|low",
      "context": "Brief quote or paraphrase showing where this was mentioned"
    }
  ],
  "totalMentioned": 0,
  "notes": "Any relevant notes about how subsites are presented (e.g. 'reviewer listed 30+ channels', 'only mentioned a few by name')"
}

If no specific subsite names are mentioned, return an empty mentionedSubsites array.
Only include site names, not vague references like "30 channels" without names.`;

async function extractSubsites(site, content) {
  const truncated = content.slice(0, 12000);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        {
          role: 'user',
          content: `## Site: ${site.name} (${site.slug})\n\n## Scraped Review Content:\n${truncated}`,
        },
      ],
      max_tokens: 1500,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error('No response from GPT-4o');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`  ⚠ GPT extraction failed: ${err.message}`);
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching sites with scraped content from ${STRAPI_URL}…\n`);
  const sites = await fetchSites();
  console.log(`Found ${sites.length} site(s) with scraped review content to analyse.\n`);

  if (sites.length === 0) {
    console.log('No sites have scrapedReviews. Run discover-review-links.mjs + fetch-review-content.mjs first.');
    return;
  }

  const results = [];

  for (const site of sites) {
    const sources = (site.scrapedReviews?.sources ?? []).filter((s) => s.isValid && s.content);
    // Concatenate all valid source content for this site
    const combinedContent = sources
      .map((s) => `=== ${s.sourceName} ===\n${s.content}`)
      .join('\n\n');

    console.log(`🔍 ${site.name} (${site.slug})  — ${sources.length} source(s)`);

    const extraction = await extractSubsites(site, combinedContent);
    if (!extraction) {
      console.log('  ⚠ Skipped (extraction failed)\n');
      continue;
    }

    const currentChildren = new Set(
      (site.child_sites ?? []).map((c) => c.name.toLowerCase().trim())
    );

    const newMentions = extraction.mentionedSubsites.filter(
      (m) => !currentChildren.has(m.name.toLowerCase().trim())
    );
    const alreadyLinked = extraction.mentionedSubsites.filter(
      (m) => currentChildren.has(m.name.toLowerCase().trim())
    );

    console.log(`  Mentioned in reviews : ${extraction.totalMentioned ?? extraction.mentionedSubsites.length}`);
    console.log(`  Already in DB        : ${alreadyLinked.length}`);
    console.log(`  NOT in DB (new)      : ${newMentions.length}`);

    if (newMentions.length > 0) {
      console.log('  New subsites to investigate:');
      for (const m of newMentions) {
        console.log(`    • ${m.name}  [confidence: ${m.confidence}]`);
        console.log(`      "${m.context}"`);
      }
    }

    if (extraction.notes) {
      console.log(`  Notes: ${extraction.notes}`);
    }

    results.push({
      site: site.name,
      slug: site.slug,
      currentChildCount: site.child_sites?.length ?? 0,
      mentionedInReviews: extraction.mentionedSubsites,
      newMentions,
      alreadyLinked,
      notes: extraction.notes,
    });

    console.log();

    // Rate limit
    await new Promise((r) => setTimeout(r, 1500));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('='.repeat(60));
  console.log('SUMMARY — SUBSITES MENTIONED IN REVIEWS BUT NOT IN DB');
  console.log('='.repeat(60));

  const actionItems = results.filter((r) => r.newMentions.length > 0);

  if (actionItems.length === 0) {
    console.log('✅ No new subsites found — DB appears up to date with review content.');
    return;
  }

  for (const item of actionItems) {
    console.log(`\n📦 ${item.site}:`);
    const highConf = item.newMentions.filter((m) => m.confidence === 'high');
    const medConf  = item.newMentions.filter((m) => m.confidence === 'medium');
    const lowConf  = item.newMentions.filter((m) => m.confidence === 'low');

    if (highConf.length > 0) {
      console.log(`  High confidence (add these):`);
      for (const m of highConf) console.log(`    + ${m.name}`);
    }
    if (medConf.length > 0) {
      console.log(`  Medium confidence (verify):`);
      for (const m of medConf) console.log(`    ? ${m.name}`);
    }
    if (lowConf.length > 0) {
      console.log(`  Low confidence (check manually):`);
      for (const m of lowConf) console.log(`    ~ ${m.name}`);
    }
  }

  console.log('\nAdd high-confidence entries to import-sites.mjs and re-run it.');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
