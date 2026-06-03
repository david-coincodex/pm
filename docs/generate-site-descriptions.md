# generate-site-descriptions.mjs

Generates rich site descriptions, short marketing taglines, and feature lists for adult entertainment sites using GPT and existing review content.

## Usage

```bash
node scripts/generate-site-descriptions.mjs [options] [slug1 slug2 ...]
```

## Options

### Field Selection

Control which fields are generated:

- `--short-description` — Generate only `short_description` (max 160 chars)
- `--included` — Generate only `included` (pipe-separated feature list)
- `--all-fields` — Generate all supported fields (default if no field flags provided)
- (default: generate all empty fields)

### Generation Control

- `--force` — Regenerate selected fields even if they already contain a value
- `--all` — Process all active sites (without this, must specify individual slugs)

### Examples

```bash
# Generate all empty fields for all sites
node scripts/generate-site-descriptions.mjs --all

# Generate only short descriptions, skip if already populated
node scripts/generate-site-descriptions.mjs --all --short-description

# Regenerate short descriptions for specific sites, overwriting existing
node scripts/generate-site-descriptions.mjs --force --short-description brazzers eporner

# Generate included features for all sites, forcing regeneration
node scripts/generate-site-descriptions.mjs --all --included --force

# Generate everything for two sites, only if fields are empty
node scripts/generate-site-descriptions.mjs slug1 slug2
```

## Behavior

### Default (No Field Flags)

If you don't specify `--short-description` or `--included`:
- Generates all supported fields that are currently empty
- Respects `parent_site` hierarchy (see below)
- Skips sites where all target fields are populated (unless `--force`)

### With `--force`

- Overwrites existing values in selected fields
- Useful for refreshing descriptions after content updates

### Parent Site Handling

Before processing:
1. Fetches the `parent_site` relationship for each site
2. **If `parent_site` exists**: skips `included` generation (inherits from main site)
3. **If no `parent_site`**: generates `included` normally

This prevents sub-sites and mirrors from duplicating feature lists.

## Required Environment

```bash
# .env file in /scripts directory
STRAPI_URL=http://localhost:1339
STRAPI_TOKEN=your_api_token
OPENAI_API_KEY=your_openai_key
```

## Generated Fields

### `short_description` (max 160 characters)

A concise marketing tagline derived from the full `description`. Suitable for:
- Meta descriptions
- Social media previews
- Email subject lines
- Search result snippets

**Example:**
```
"Exclusive HD content with daily updates from top performers"
```

**Instructions:** See `site-short-description-prompt.md`

### `included` (pipe-separated list)

Key features, content types, and services offered by the site. Examples:
- Content format: `HD Videos`, `4K Library`, `VR Content`
- Access: `Live Streams`, `Downloads`, `Cloud Streaming`
- Social: `User Community`, `Fan Chat`, `Performer Profiles`
- Premium: `Ad-Free`, `Exclusive Scenes`, `Early Access`

**Example:**
```
"HD Videos|4K Content|Live Streams|Downloads|No Ads"
```

**Instructions:** See `site-included-prompt.md`

## Prompt Files

All generation uses GPT-5.5 with system prompts stored as markdown files:

- `site-description-prompt.md` — Full description generation (main descriptions)
- `site-short-description-prompt.md` — Short tagline generation
- `site-included-prompt.md` — Feature list generation

These can be edited to customize generation style and output format.

## Output & Summary

After processing, the script prints:

```
━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Processed: 5 | Updated: 4 | Skipped: 1
Skipped due to missing review: 1
Skipped due to parent_site (included): 2
Fields generated:
  • short_description: 4
  • included: 2
```

Errors are logged per-site with details:
```
✗ Errors (1):
  • example.com: No response from GPT-5.5
```

## Notes

- Rate limiting: 2 seconds between requests to respect API limits
- Fields are only updated if generation succeeds
- Parent site checks prevent data duplication across site networks
- All timestamps use ISO 8601 format
