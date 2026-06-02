#!/usr/bin/env node
/**
 * fetch-review-content.mjs
 *
 * Scrapes review content from each site's reviewSources URLs, validates with
 * GPT-4o-mini, and stores the results in the site's scrapedReviews JSON field.
 *
 * Usage:
 *   node scripts/fetch-review-content.mjs [options] [slug1 slug2 ...]
 *
 * Options:
 *   --all       Process all sites that have reviewSources
 *   --force     Re-scrape even if scrapedReviews already exists
 *
 * Environment:
 *   STRAPI_URL      (default: http://localhost:1339)
 *   STRAPI_TOKEN    API token for Strapi
 *   OPENAI_API_KEY  OpenAI API key (for content validation)
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');
dotenv.config({ path: `${__dirname}/.env` });
import { chromium } from 'playwright';
import OpenAI from 'openai';

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

// ── CLI Parsing ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const forceMode = args.includes('--force');
const allMode = args.includes('--all');
const skipContext = args.includes('--skip-context');
const slugs = args.filter((a) => !a.startsWith('--'));

if (!allMode && slugs.length === 0) {
  console.error('Usage: node scripts/fetch-review-content.mjs [--all | slug1 slug2 ...] [--force] [--skip-context]');
  process.exit(1);
}

// ── Strapi Helpers ─────────────────────────────────────────────────────────────

async function fetchSites() {
  let page = 1;
  const pageSize = 100;
  const allSites = [];

  while (true) {
    const params = new URLSearchParams({
      'populate[0]': 'reviewSources',
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

async function updateScrapedReviews(documentId, scrapedReviews) {
  const res = await fetch(`${STRAPI_URL}/api/sites/${documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { scrapedReviews } }),
  });
  if (!res.ok) throw new Error(`Failed to update site ${documentId}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function updateExternalContext(documentId, externalContext) {
  const res = await fetch(`${STRAPI_URL}/api/sites/${documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { externalContext } }),
  });
  if (!res.ok) throw new Error(`Failed to update externalContext for ${documentId}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Content Extraction (Playwright DOM) ────────────────────────────────────────

async function extractContent(page) {
  // Use Playwright to extract rendered text from the most relevant content area.
  // This handles SPAs (Next.js, React) that require JS execution to render.

  const selectors = [
    'article',
    '[role="main"]',
    'main',
    '.review-content',
    '.entry-content',
    '.post-content',
    '.content',
    '.review',
    '#content',
    // CSS module patterns (hashed class names)
    '[class*="Review"]',
    '[class*="review"]',
    '[class*="siteContainer"]',
    '[class*="article"]',
  ];

  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() > 0) {
        const text = await el.innerText({ timeout: 5000 });
        if (text.trim().length > 500) {
          return text.replace(/\s+/g, ' ').trim().slice(0, 15000);
        }
      }
    } catch { /* selector not found or timeout */ }
  }

  // Fallback: get the largest top-level div
  try {
    const divs = page.locator('body > div');
    const count = await divs.count();
    let best = '';
    for (let i = 0; i < count && i < 10; i++) {
      try {
        const text = await divs.nth(i).innerText({ timeout: 3000 });
        if (text.length > best.length) best = text;
      } catch { /* skip */ }
    }
    if (best.trim().length > 500) {
      return best.replace(/\s+/g, ' ').trim().slice(0, 15000);
    }
  } catch { /* ignore */ }

  // Final fallback: full page text
  try {
    const text = await page.locator('body').innerText({ timeout: 5000 });
    return text.replace(/\s+/g, ' ').trim().slice(0, 15000);
  } catch {
    return '';
  }
}

// ── Scraping ───────────────────────────────────────────────────────────────────

async function scrapeSource(page, source, siteName) {
  try {
    const response = await page.goto(source.sourceUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    if (!response || response.status() >= 400) {
      return { ...source, content: null, scrapedAt: new Date().toISOString(), isValid: false, error: `HTTP ${response?.status() || 'no response'}` };
    }

    // Extra wait for JS-rendered SPAs (Next.js, React sites)
    await page.waitForTimeout(3000);

    const content = await extractContent(page);

    if (!content || content.length < 100) {
      return { ...source, content: null, scrapedAt: new Date().toISOString(), isValid: false, error: 'No meaningful content extracted' };
    }

    return {
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl,
      content,
      scrapedAt: new Date().toISOString(),
      isValid: true,
    };
  } catch (err) {
    return {
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl,
      content: null,
      scrapedAt: new Date().toISOString(),
      isValid: false,
      error: err.message,
    };
  }
}

// ── Context Consolidation (GPT-4o) ────────────────────────────────────────────

const CONSOLIDATION_PROMPT = `You are a data analyst specialising in adult entertainment websites. You will receive scraped review text from multiple external review sites about a SINGLE adult website.

Your task: Consolidate all sources into a single structured JSON "source of truth" that a review writer can use.

Instructions:
1. **Extract freshness**: Look for publication dates, "last updated", "reviewed on", copyright years, or any temporal indicators in each source's text. If no explicit date is found, estimate confidence as "low".
2. **Resolve conflicts**: When sources disagree (e.g. different video counts, different claims about features), prefer the most recent source. Note what was conflicting.
3. **Synthesise facts**: Combine all unique factual information into a unified context.
4. **Never invent**: If no source mentions something, don't fabricate it.

Respond with ONLY a JSON object in this exact structure:
{
  "siteFacts": {
    "founded": "year or null",
    "networkAffiliation": "parent company/network or null",
    "contentVolume": "description of library size",
    "updateFrequency": "how often new content is added",
    "exclusiveContent": "percentage or description of exclusivity",
    "videoQuality": "resolution/production quality",
    "notableFeatures": ["feature1", "feature2"],
    "notablePerformers": ["name1", "name2"],
    "contentNiches": ["niche1", "niche2"]
  },
  "contentHighlights": "2-3 sentences summarising what makes this site noteworthy",
  "knownIssues": ["issue1", "issue2"],
  "pricingInfo": "general pricing tier description (no exact dollar amounts) — monthly/annual/trial availability and relative value vs competitors",
  "recentChanges": "any noted updates, redesigns, or changes mentioned in sources (or null)",
  "sourcesFreshness": [
    { "sourceName": "...", "estimatedDate": "YYYY-MM or 'unknown'", "confidence": "high|medium|low", "reasoning": "how date was determined" }
  ],
  "conflictResolutions": ["description of conflict and which source was preferred and why"],
  "reviewerOpinions": [
    { "sourceName": "TheBestPorn", "sentiment": "positive|mixed|negative", "rating": "score if mentioned (e.g. '4/5', '85%') or null", "verdict": "1-2 sentence paraphrase of the reviewer's overall opinion", "quotableSnippet": "A direct sentence or phrase from the source text that could be used as a blockquote — must be the reviewer's actual words, not a paraphrase" }
  ],
  "consolidatedAt": "ISO timestamp"
}`;

async function consolidateContext(site, scrapedSources) {
  const validSources = scrapedSources.filter((s) => s.isValid && s.content);
  if (validSources.length === 0) return null;

  const sourcesText = validSources
    .map((s) => `### ${s.sourceName} (scraped ${s.scrapedAt})\n${s.content.slice(0, 8000)}`)
    .join('\n\n---\n\n');

  const userMessage = `## Site: ${site.name}\n- URL: ${site.url}\n- Type: ${site.siteType}\n\n## Scraped Sources (${validSources.length} valid)\n\n${sourcesText}\n\nConsolidate all information into the structured JSON format.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: CONSOLIDATION_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 3000,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error('No response from GPT-4o');

    const context = JSON.parse(raw);
    context.consolidatedAt = new Date().toISOString();
    return context;
  } catch (err) {
    console.warn(`  ⚠ Consolidation failed: ${err.message}`);
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching sites from Strapi...');
  const sites = await fetchSites();

  // Filter to only sites with reviewSources
  const sitesWithSources = sites.filter((s) => (s.reviewSources ?? []).length > 0);
  console.log(`Found ${sitesWithSources.length} site(s) with review sources.\n`);

  if (sitesWithSources.length === 0) {
    console.log('No sites have reviewSources. Run discover-review-links.mjs first.');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  let processed = 0;
  let skipped = 0;
  let updated = 0;
  const invalidLinks = [];

  for (const site of sitesWithSources) {
    const existingScraped = site.scrapedReviews;

    if (existingScraped && !forceMode) {
      console.log(`⏭  ${site.name} — already has scraped data, skipping (use --force to overwrite)`);
      skipped++;
      continue;
    }

    console.log(`📥 ${site.name} (${site.slug}) — ${site.reviewSources.length} source(s)`);
    processed++;

    const sources = [];
    for (const source of site.reviewSources) {
      console.log(`  → Scraping ${source.sourceName}...`);
      const result = await scrapeSource(page, source, site.name);
      sources.push(result);

      if (!result.isValid) {
        invalidLinks.push({ site: site.name, source: source.sourceName, url: source.sourceUrl, error: result.error });
        console.log(`  ⚠ ${source.sourceName}: ${result.error}`);
      } else {
        console.log(`  ✓ ${source.sourceName}: ${result.content.length} chars`);
      }

      // Rate limiting between sources
      await new Promise((r) => setTimeout(r, 2000));
    }

    const scrapedReviews = {
      sources,
      lastUpdated: new Date().toISOString(),
    };

    await updateScrapedReviews(site.documentId, scrapedReviews);
    updated++;
    console.log(`  💾 Saved scraped data (${sources.filter((s) => s.isValid).length} valid / ${sources.length} total)`);

    // ── Consolidate context ──
    if (!skipContext) {
      const validCount = sources.filter((s) => s.isValid).length;
      if (validCount > 0) {
        console.log(`  🧠 Consolidating context from ${validCount} valid source(s)...`);
        const context = await consolidateContext(site, sources);
        if (context) {
          await updateExternalContext(site.documentId, context);
          console.log(`  ✓ External context saved`);
        } else {
          console.log(`  ⚠ Could not consolidate context — raw data still available`);
        }
      }
    }
    console.log('');
  }

  await browser.close();

  // Summary
  console.log('\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Processed: ${processed} | Updated: ${updated} | Skipped: ${skipped}`);

  if (invalidLinks.length > 0) {
    console.log(`\n⚠ Invalid/failed links (${invalidLinks.length}):`);
    for (const link of invalidLinks) {
      console.log(`  • ${link.site} → ${link.source}: ${link.error}`);
      console.log(`    URL: ${link.url}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
