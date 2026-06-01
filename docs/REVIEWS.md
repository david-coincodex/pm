# Review Generation Pipeline

A 3-step pipeline for generating original site reviews by scraping external review sources, consolidating them into verified context, and using GPT-5.5 to write content with post-generation hallucination checking.

---

## Prerequisites

```bash
cd scripts && npm install
npx playwright install chromium
```

All scripts read credentials from `scripts/.env`:

```env
STRAPI_TOKEN=your_strapi_api_token
OPENAI_API_KEY=sk-...
STRAPI_URL=http://localhost:1339
```

Load before running:

```bash
cd scripts
export $(cat .env | xargs)
```

---

## Step 1 — Discover Review Links

`discover-review-links.mjs` searches five external review sites for matching reviews and saves the URLs to each site's **Review Sources** field in Strapi.

**Searched sources:**
- TheBestPorn.com
- AdultReviews.com
- RabbitsReviews.com
- MrPornGeek.com
- PornInspector.com

```bash
# Process all sites
node discover-review-links.mjs --all

# Process specific sites
node discover-review-links.mjs brazzers adult-time reality-kings

# Force re-discover even if sources already exist
node discover-review-links.mjs --all --force
```

**Output:** Updates the `reviewSources` component on each Site in Strapi. You can verify in the admin by opening any Site entry — the Review Sources field will list found URLs.

> **Note:** Sites with no matches are logged as warnings. You can manually add source URLs in the Strapi admin if auto-discovery misses them (Site → Review Sources → Add entry).

---

## Step 2 — Fetch Review Content

`fetch-review-content.mjs` scrapes the content from each discovered source URL using Playwright (headless Chromium with `innerText()` extraction) and stores the results as JSON on the Site. Since sources are curated URLs, no GPT validation is needed.

```bash
# Process all sites that have review sources
node fetch-review-content.mjs --all

# Process specific sites
node fetch-review-content.mjs brazzers adult-time

# Force re-scrape even if content was already fetched
node fetch-review-content.mjs --all --force
```

**Output:** Updates the `scrapedReviews` JSON field on each Site. Structure:

```json
{
  "sources": [
    {
      "sourceName": "TheBestPorn",
      "sourceUrl": "https://www.thebestporn.com/brazzers/",
      "content": "extracted review text...",
      "scrapedAt": "2026-05-27T12:00:00Z",
      "isValid": true
    }
  ],
  "lastUpdated": "2026-05-27T12:00:00Z"
}
```

Sources that fail to load (HTTP errors, timeouts) or return insufficient content (<500 chars after selector matching) are marked `isValid: false`.

### Context Consolidation (Step 2b)

After scraping, the script automatically consolidates all valid sources into a structured `externalContext` JSON field on the Site via **GPT-5.5**. This step:

- Extracts publication/update dates from each source text
- Resolves conflicts between sources (prefers most recent/consistent data)
- Captures reviewer opinions (sentiment, ratings, verdicts) per source
- Produces a verified "source of truth" for the review generator

```bash
# Skip consolidation (scrape only)
node fetch-review-content.mjs --all --skip-context
```

**Output:** Updates the `externalContext` JSON field on each Site. Structure:

```json
{
  "siteFacts": {
    "founded": "2004",
    "networkAffiliation": "MindGeek",
    "contentVolume": "12,000+ scenes",
    "updateFrequency": "Daily updates",
    "exclusiveContent": "~90% exclusive",
    "videoQuality": "4K/1080p",
    "notableFeatures": ["VR content", "Download options"],
    "notablePerformers": ["..."],
    "contentNiches": ["mainstream", "parody"]
  },
  "contentHighlights": "...",
  "knownIssues": ["DRM on downloads", "No 4K on older content"],
  "pricingInfo": "Premium-priced with monthly/annual/trial options...",
  "recentChanges": "Redesigned player in 2025...",
  "sourcesFreshness": [
    { "sourceName": "TheBestPorn", "estimatedDate": "2025-11", "confidence": "high", "reasoning": "..." }
  ],
  "conflictResolutions": ["Source A said 8000 scenes, Source B said 12000 — preferred B (more recent)"],
  "reviewerOpinions": [
    { "sourceName": "TheBestPorn", "sentiment": "positive", "rating": "A+", "verdict": "Paraphrased reviewer opinion..." }
  ],
  "consolidatedAt": "2026-05-28T14:00:00Z"
}
```

If consolidation fails (API error), the raw scraped data remains available as fallback.

---

## Step 3 — Generate Reviews

`generate-reviews.mjs` uses **GPT-5.5** to write original reviews from the consolidated context (or raw scraped content as fallback) and site metadata, then backchecks the output against the source context before saving to Strapi.

```bash
# Requires: --author <slug> matching an Author entry in Strapi

# Generate drafts for all sites
node generate-reviews.mjs --author pornmode-team --all

# Generate for specific sites
node generate-reviews.mjs --author pornmode-team brazzers adult-time

# Force overwrite existing reviews
node generate-reviews.mjs --author pornmode-team --all --force

# Publish immediately (default is draft)
node generate-reviews.mjs --author pornmode-team brazzers --force --publish

# Skip the hallucination backcheck
node generate-reviews.mjs --author pornmode-team brazzers --force --skip-backcheck

# Update existing review — set modifiedDate to now, keep publishDate
node generate-reviews.mjs --author pornmode-team brazzers --force --set-modified

# Republish — clear modifiedDate, set publishDate to now (fresh publish)
node generate-reviews.mjs --author pornmode-team brazzers --force --republish
```

**Output:** Creates or updates Review entries in Strapi as drafts (or published with `--publish`).

### Inline Reviewer Quotes

When `reviewerOpinions` data is available in the externalContext, GPT-5.5 includes 1-2 `<blockquote>` elements in the review HTML quoting or paraphrasing external reviewers, plus optionally 1 casual prose mention. Max 2-3 source references per review, each source mentioned at most once.

### Post-Generation Backcheck

After generating a review, the script automatically sends the content + externalContext to **GPT-4o-mini** for hallucination checking. It flags:

- **Contradicted** claims — facts that conflict with the source context
- **Fabricated** claims — specific numbers/dates/features not in any source
- **Outdated** claims — information the context indicates has changed

Flagged issues are logged as warnings but do **not** block saving/publishing. Use `--skip-backcheck` to bypass this step.

---

## Review Structure

### Paysites
1. Opening paragraphs (no heading) — intro, founding year, niche, network
2. `<h2>Content Library</h2>` — volume, categories, update frequency
3. `<h2>Quality & Production</h2>` — resolution, cinematography, audio
4. `<h2>Exclusive Content</h2>` — exclusivity ratio, notable series
5. `<h2>User Experience</h2>` — navigation, search, streaming, downloads, mobile
6. `<h2>Pricing & Value</h2>` — plans, value vs competitors
7. Pros & Cons widget (auto-injected before Verdict)
8. `<h2>Verdict</h2>` — final recommendation

### Camsites
1. Opening paragraphs (no heading)
2. `<h2>Model Selection</h2>`
3. `<h2>Stream Quality</h2>`
4. `<h2>Interactivity & Features</h2>`
5. `<h2>Privacy & Security</h2>`
6. `<h2>Pricing & Value</h2>`
7. Pros & Cons widget
8. `<h2>Verdict</h2>`

### Pros & Cons
Rendered on the frontend via the custom CKEditor widget component (`ProsConsBlock`). The script injects it automatically before the Verdict section:

```html
<div class="pros-cons-block" data-component="pros-cons"
     data-pros="Pro 1||Pro 2||Pro 3"
     data-cons="Con 1||Con 2"
     contenteditable="false"></div>
```

---

## Scores

GPT-5.5 assigns scores (1–10) for each category:

**Paysites:** Content Quality, Content Amount, Value, Updates, Exclusivity, Features, Downloads, Streaming, Mobile Experience

**Camsites:** Model Variety, Stream Quality, Features, Value, Interactivity, Mobile Experience, Privacy, Private Shows

---

## Fields Generated Per Review

| Field | Description |
|-------|-------------|
| `displayTitle` | Auto-set by lifecycle hook: "{Site Name} Review" |
| `titleExtra` | Catchy subtitle, max 30 chars (e.g. "Worth It in 2026?") |
| `description` | SEO meta description, max 160 chars |
| `content` | Full HTML with all sections + pros/cons widget |
| `paysiteScores` / `camsiteScores` | Score component (based on siteType) |
| `publishDate` | Set to now on create, or controlled by `--set-modified`/`--republish` |

---

## Adding New External Sources

To add a new review site as a source for discovery (Step 1), edit the `SOURCES` array in `discover-review-links.mjs`:

```js
{
  name: 'NewSiteName',
  buildUrl: (slug, siteName) => `https://www.newsite.com/${slug}/`,
  altBuildUrl: (slug, siteName) => `https://www.newsite.com/review/${slug}/`,
},
```

No schema changes needed — the scraped data storage is flexible JSON.

To manually add source URLs for a specific site without running Script 1, open the site in the Strapi admin → **Review Sources** → **Add entry**.

---

## Typical Full Run

```bash
cd scripts && export $(cat .env | xargs)

# 1. Find external review links for all sites
node discover-review-links.mjs --all

# 2. Scrape, validate, and consolidate context
node fetch-review-content.mjs --all

# 3. Generate draft reviews (with auto-backcheck)
node generate-reviews.mjs --author pornmode-team --all

# Then open Strapi admin, review each draft, and publish manually
```
