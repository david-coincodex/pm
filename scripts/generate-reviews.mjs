#!/usr/bin/env node
/**
 * generate-reviews.mjs
 *
 * Uses GPT-5.0 to generate original reviews from previously scraped content.
 * Saves reviews to Strapi as drafts (or published with --publish).
 *
 * Usage:
 *   node scripts/generate-reviews.mjs [options] [slug1 slug2 ...]
 *
 * Options:
 *   --all             Process all sites with scraped content
 *   --force           Overwrite existing reviews (default: skip sites with reviews)
 *   --author <slug>   Author slug for the review (REQUIRED)
 *   --publish         Publish directly (default: draft)
 *   --set-modified    Set modifiedDate to now (for updates)
 *   --republish       Clear modifiedDate, set publishDate to now
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
import { randomBytes as cryptoRandomBytes } from 'crypto';
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
const SYSTEM_PROMPT = readFileSync(join(__dirname, 'review-prompt.md'), 'utf-8');

// ── CLI Parsing ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const forceMode = args.includes('--force');
const allMode = args.includes('--all');
const publishMode = args.includes('--publish');
const setModified = args.includes('--set-modified');
const republish = args.includes('--republish');
const skipBackcheck = args.includes('--skip-backcheck');

let authorSlug = null;
const authorIdx = args.indexOf('--author');
if (authorIdx !== -1 && args[authorIdx + 1]) {
  authorSlug = args[authorIdx + 1];
}

const slugs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--author');

if (!authorSlug) {
  console.error('Error: --author <slug> is required.');
  process.exit(1);
}

if (!allMode && slugs.length === 0) {
  console.error('Usage: node scripts/generate-reviews.mjs --author <slug> [--all | slug1 slug2 ...] [--force] [--publish] [--set-modified | --republish]');
  process.exit(1);
}

// ── Strapi Helpers ─────────────────────────────────────────────────────────────

async function fetchAuthor(slug) {
  const res = await fetch(
    `${STRAPI_URL}/api/authors?filters[slug][$eq]=${encodeURIComponent(slug)}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to fetch author: ${res.status}`);
  const { data } = await res.json();
  return data[0] ?? null;
}

async function fetchSites() {
  let page = 1;
  const pageSize = 100;
  const allSites = [];

  while (true) {
    const params = new URLSearchParams({
      'populate[0]': 'reviewSources',
      'populate[1]': 'offers',
      'populate[2]': 'platform',
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

async function fetchExistingReview(siteDocumentId) {
  const res = await fetch(
    `${STRAPI_URL}/api/reviews?filters[site][documentId][$eq]=${siteDocumentId}&pagination[pageSize]=1`,
    { headers }
  );
  if (!res.ok) return null;
  const { data } = await res.json();
  return data[0] ?? null;
}

async function createReview(reviewData) {
  const res = await fetch(`${STRAPI_URL}/api/reviews`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data: reviewData }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create review: ${res.status} ${text}`);
  }
  return res.json();
}

async function updateReview(documentId, reviewData) {
  const res = await fetch(`${STRAPI_URL}/api/reviews/${documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: reviewData }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update review: ${res.status} ${text}`);
  }
  return res.json();
}

async function publishReview(documentId) {
  const res = await fetch(`${STRAPI_URL}/api/reviews/${documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { publishedAt: new Date().toISOString() } }),
  });
  if (!res.ok) throw new Error(`Failed to publish review: ${res.status}`);
}

// ── Review Generation ──────────────────────────────────────────────────────────

function buildUserPrompt(site) {
  const context = site.externalContext;
  const scraped = site.scrapedReviews;
  const validSources = (scraped?.sources ?? []).filter((s) => s.isValid && s.content);

  let prompt = `## Site Information\n`;
  prompt += `- **Name**: ${site.name}\n`;
  prompt += `- **Slug**: ${site.slug}\n`;
  prompt += `- **URL**: ${site.url}\n`;
  prompt += `- **Site Type**: ${site.siteType}\n`;
  if (site.short_description) prompt += `- **Short Description**: ${site.short_description}\n`;
  if (site.included) prompt += `- **Included Networks/Sites**: ${site.included}\n`;

  // Offers/pricing info — pass plan types only, no exact prices
  const activeOffers = (site.offers ?? []).filter((o) => o.isActive);
  if (activeOffers.length > 0) {
    prompt += `\n## Pricing Plans (plan types only — do NOT mention exact prices)\n`;
    const planTypes = [...new Set(activeOffers.map((o) => o.offerType || o.offerKind).filter(Boolean))];
    for (const label of planTypes) {
      const hasDownloads = activeOffers.some((o) => (o.offerType || o.offerKind) === label && o.allowsDownloads);
      prompt += `- ${label}${hasDownloads ? ' [includes downloads]' : ''}\n`;
    }
  }

  // Platform info
  if (site.platform) {
    prompt += `\n## Platform\n`;
    prompt += `- **Operated by**: ${site.platform.name}\n`;
    if (site.platform.description) prompt += `- **About**: ${site.platform.description}\n`;
  }

  // Use consolidated external context when available, fall back to raw scraped data
  if (context && context.siteFacts) {
    prompt += `\n## Consolidated Research Context\n`;
    prompt += `*This is pre-processed context consolidating multiple external review sources. Use this as your primary factual reference.*\n\n`;

    const facts = context.siteFacts;
    if (facts.founded) prompt += `- **Founded**: ${facts.founded}\n`;
    if (facts.networkAffiliation) prompt += `- **Network**: ${facts.networkAffiliation}\n`;
    if (facts.contentVolume) prompt += `- **Content Volume**: ${facts.contentVolume}\n`;
    if (facts.updateFrequency) prompt += `- **Update Frequency**: ${facts.updateFrequency}\n`;
    if (facts.exclusiveContent) prompt += `- **Exclusive Content**: ${facts.exclusiveContent}\n`;
    if (facts.videoQuality) prompt += `- **Video Quality**: ${facts.videoQuality}\n`;
    if (facts.notableFeatures?.length) prompt += `- **Notable Features**: ${facts.notableFeatures.join(', ')}\n`;
    if (facts.notablePerformers?.length) prompt += `- **Notable Performers**: ${facts.notablePerformers.join(', ')}\n`;
    if (facts.contentNiches?.length) prompt += `- **Content Niches**: ${facts.contentNiches.join(', ')}\n`;

    if (context.contentHighlights) prompt += `\n### Highlights\n${context.contentHighlights}\n`;
    if (context.knownIssues?.length) prompt += `\n### Known Issues\n${context.knownIssues.map((i) => `- ${i}`).join('\n')}\n`;
    if (context.pricingInfo) prompt += `\n### Pricing Context\n${context.pricingInfo}\n`;
    if (context.recentChanges) prompt += `\n### Recent Changes\n${context.recentChanges}\n`;
    if (context.conflictResolutions?.length) {
      prompt += `\n### Source Conflict Notes\n${context.conflictResolutions.map((c) => `- ${c}`).join('\n')}\n`;
    }
    if (context.reviewerOpinions?.length) {
      prompt += `\n### Reviewer Opinions (use 1-2 blockquotes from quotableSnippet; source name goes ONLY in <cite>, never in the quote text)\n`;
      for (const op of context.reviewerOpinions) {
        prompt += `- **${op.sourceName}**: ${op.sentiment}${op.rating ? ` (${op.rating})` : ''} — ${op.verdict}`;
        if (op.quotableSnippet) prompt += `\n  > Quotable: "${op.quotableSnippet}"`;
        prompt += `\n`;
      }
    }
    if (context.sourcesFreshness?.length) {
      prompt += `\n### Source Freshness\n`;
      for (const sf of context.sourcesFreshness) {
        prompt += `- ${sf.sourceName}: ${sf.estimatedDate} (${sf.confidence} confidence)\n`;
      }
    }
  } else if (validSources.length > 0) {
    // Fallback: raw scraped data (no consolidation available)
    prompt += `\n## Source Reviews (for reference — do NOT copy verbatim)\n\n`;
    for (const source of validSources) {
      prompt += `### ${source.sourceName}\n`;
      prompt += `${source.content.slice(0, 5000)}\n\n`;
    }
  } else {
    prompt += `\n## Source Reviews\nNo scraped sources available. Write the review based on your knowledge of this site and the metadata above.\n`;
  }

  prompt += `\n## Instructions\nGenerate a complete review for "${site.name}" following the system prompt structure for siteType "${site.siteType}". Return ONLY valid JSON.`;

  return prompt;
}

function ckeUid() {
  // Matches CKEditor's uid(): 'e' + 32 random hex chars (4 × uint32)
  const bytes = cryptoRandomBytes(16);
  return 'e' + bytes.toString('hex');
}

function buildProsConsWidget(pros, cons) {
  const prosStr = pros.join('||');
  const consStr = cons.join('||');
  const prosItems = pros.map((p) => `\n            <li data-list-item-id="${ckeUid()}">\n                ${p}\n            </li>`).join('');
  const consItems = cons.map((c) => `\n            <li data-list-item-id="${ckeUid()}">\n                ${c}\n            </li>`).join('');
  return `<div class="pros-cons-block" data-component="pros-cons" data-pros="${prosStr}" data-cons="${consStr}" contenteditable="false">
    <div class="pros-cons-block__pros">
        <ul>${prosItems}
        </ul>
    </div>
    <div class="pros-cons-block__cons">
        <ul>${consItems}
        </ul>
    </div>
</div>`;
}

function assembleContent(generated) {
  // Insert pros/cons widget right before the FIRST <h2> tag
  const firstH2Idx = generated.contentHtml.indexOf('<h2>');
  if (firstH2Idx === -1) {
    // If no H2 at all, append at the end
    return generated.contentHtml + '\n' + buildProsConsWidget(generated.pros, generated.cons);
  }

  const before = generated.contentHtml.slice(0, firstH2Idx);
  const after = generated.contentHtml.slice(firstH2Idx);
  return before + buildProsConsWidget(generated.pros, generated.cons) + '\n' + after;
}

async function generateReview(site) {
  const userPrompt = buildUserPrompt(site);

  const response = await openai.chat.completions.create({
    model: 'gpt-5.5',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: 4000,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('No response from GPT-5.5');

  const parsed = JSON.parse(raw);

  // Validate required fields
  if (!parsed.contentHtml || !parsed.scores || !parsed.pros || !parsed.cons) {
    throw new Error('Invalid response structure — missing required fields');
  }

  return parsed;
}

// ── Post-Generation Backcheck (GPT-4o-mini) ────────────────────────────────────

async function backcheckreview(site, contentHtml) {
  const context = site.externalContext;
  if (!context || !context.siteFacts) {
    // No context to verify against — skip silently
    return { passed: true, issues: [], note: 'No externalContext available for verification' };
  }

  const contextSummary = JSON.stringify(context, null, 2).slice(0, 6000);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a fact-checker for adult site reviews. Compare a generated review against the verified source context and flag any claims that are:
1. **Contradicted** by the source context (factual errors)
2. **Fabricated** — specific claims (numbers, dates, features) not supported by any data in the context
3. **Outdated** — information the context indicates has changed

Do NOT flag:
- Subjective opinions or tone
- General industry knowledge (e.g. "4K is becoming standard")
- Omissions (review doesn't mention something)

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "issues": [
    { "type": "contradicted|fabricated|outdated", "claim": "the problematic claim from the review", "reason": "why it's wrong based on context" }
  ]
}

If no issues found, return {"passed": true, "issues": []}.`,
        },
        {
          role: 'user',
          content: `## Source Context (verified facts)\n\`\`\`json\n${contextSummary}\n\`\`\`\n\n## Generated Review HTML\n${contentHtml.slice(0, 8000)}`,
        },
      ],
      max_tokens: 1000,
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return { passed: true, issues: [], note: 'Empty backcheck response' };

    return JSON.parse(raw);
  } catch (err) {
    console.warn(`  ⚠ Backcheck failed: ${err.message}`);
    return { passed: true, issues: [], note: `Backcheck error: ${err.message}` };
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  // Fetch author
  console.log(`Looking up author: ${authorSlug}...`);
  const author = await fetchAuthor(authorSlug);
  if (!author) {
    console.error(`Error: Author with slug "${authorSlug}" not found.`);
    process.exit(1);
  }
  console.log(`Author: ${author.name} (${author.documentId})\n`);

  // Fetch sites
  console.log('Fetching sites from Strapi...');
  const sites = await fetchSites();

  // Filter to sites with valid scraped content
  const sitesWithContent = sites.filter((s) => {
    const scraped = s.scrapedReviews;
    if (!scraped?.sources) return false;
    return scraped.sources.some((src) => src.isValid && src.content);
  });

  // Also allow sites without scraped data (GPT will use its own knowledge)
  const allSitesForGeneration = allMode
    ? sites // process all if --all, even without scraped data
    : sites.filter((s) => slugs.includes(s.slug));

  const targetSites = allMode ? allSitesForGeneration : allSitesForGeneration;
  console.log(`Found ${targetSites.length} site(s) to process.\n`);

  if (targetSites.length === 0) {
    console.log('No matching sites found.');
    return;
  }

  let processed = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let skippedMissingExternalContext = 0;
  const errors = [];

  for (const site of targetSites) {
    if (!site.externalContext) {
      console.log(`⏭  ${site.name} — missing externalContext, skipping`);
      skipped++;
      skippedMissingExternalContext++;
      continue;
    }

    // Check for existing review
    const existing = await fetchExistingReview(site.documentId);

    if (existing && !forceMode) {
      console.log(`⏭  ${site.name} — review exists, skipping (use --force to overwrite)`);
      skipped++;
      continue;
    }

    console.log(`🤖 ${site.name} (${site.slug}) — generating review...`);
    processed++;

    try {
      const generated = await generateReview(site);
      const content = assembleContent(generated);

      // ── Backcheck against source context ──
      if (!skipBackcheck) {
        console.log(`  🔍 Backchecking against source context...`);
        const check = await backcheckreview(site, content);
        if (!check.passed && check.issues?.length > 0) {
          console.warn(`  ⚠ Backcheck flagged ${check.issues.length} issue(s):`);
          for (const issue of check.issues) {
            console.warn(`    • [${issue.type}] "${issue.claim}" — ${issue.reason}`);
          }
        } else {
          console.log(`  ✓ Backcheck passed`);
        }
      }

      // Build score component based on siteType
      const scoreKey = site.siteType === 'camsite' ? 'camsiteScores' : 'paysiteScores';

      // Determine dates
      const now = new Date().toISOString();
      let publishDate;
      let modifiedDate = null;

      if (existing) {
        if (republish) {
          publishDate = now;
          modifiedDate = null;
        } else if (setModified) {
          publishDate = existing.publishDate;
          modifiedDate = now;
        } else {
          publishDate = existing.publishDate || now;
          modifiedDate = now;
        }
      } else {
        publishDate = now;
      }

      const reviewData = {
        site: site.documentId,
        author: author.documentId,
        titleExtra: generated.titleExtra || null,
        description: generated.description || null,
        content,
        [scoreKey]: generated.scores,
        publishDate,
        ...(modifiedDate && { modifiedDate }),
      };

      if (existing) {
        await updateReview(existing.documentId, reviewData);
        if (publishMode) await publishReview(existing.documentId);
        updated++;
        console.log(`  ✓ Updated review for ${site.name}`);
      } else {
        const result = await createReview(reviewData);
        if (publishMode && result.data?.documentId) {
          await publishReview(result.data.documentId);
        }
        created++;
        console.log(`  ✓ Created review for ${site.name}`);
      }

      if (generated.titleExtra) console.log(`    Title: "${generated.titleExtra}"`);
      console.log(`    Scores: ${Object.entries(generated.scores).map(([k, v]) => `${k}:${v}`).join(', ')}`);
      console.log(`    Pros: ${generated.pros.length} | Cons: ${generated.cons.length}\n`);
    } catch (err) {
      errors.push({ site: site.name, error: err.message });
      console.error(`  ✗ Error for ${site.name}: ${err.message}\n`);
    }

    // Rate limiting between GPT calls
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Summary
  console.log('\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Processed: ${processed} | Created: ${created} | Updated: ${updated} | Skipped: ${skipped}`);
  if (skippedMissingExternalContext > 0) {
    console.log(`Skipped due to missing externalContext: ${skippedMissingExternalContext}`);
  }
  if (publishMode) console.log(`Mode: Published`);
  else console.log(`Mode: Draft (review in Strapi admin before publishing)`);

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
