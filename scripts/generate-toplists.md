# Toplist Article Generator

Generates fresh "toplist" blog articles with GPT-5.5 from multiple external sources + our own site/review data, and saves them as **draft Articles** in Strapi. FAQs are written to the structured `faqs` component (rendered at the bottom of the article with FAQPage schema).

## Files

- `generate-toplists.mjs` — the script
- `toplist-prompt.md` — GPT system prompt (role, SEO rules, current-year handling, JSON output schema)
- `toplist-elements.md` — exact markup for our widgets/elements (SiteList, Pros/Cons, quote, image; SiteCard/CTA for general lists)
- `toplist-consolidate-prompt.md` — GPT-4o prompt that distills + validates scraped sources (drops gibberish)
- `build-avn-awards.mjs` + `data/avn-awards.json` — cached AVN headline awards (Female/Male Performer of the Year + Hall of Fame, with years) scraped from Wikipedia's award-list pages. Rebuild with `npm run build-avn-awards` (data changes ~yearly).
- `toplist-structures/<type>.md` — per-type article structure. Add a new file to add a new type.
  - `general-toplist.md` — topical lists (e.g. "Best Teen Pornstars 2026")
  - `similar-to-site.md` — "Sites Similar to <site>"
  - `best-site-ads.md` — "Best <site> Alternatives"
- `toplist-jobs.example.json` — example jobs config; copy to `toplist-jobs.json`

## Requirements

`STRAPI_TOKEN`, `OPENAI_API_KEY` in `scripts/.env`. `STRAPI_URL` defaults to `http://localhost:1339`. Uses `playwright` (already a dep) for scraping.

## Jobs config (`toplist-jobs.json`)

Array of jobs:

| field | required | notes |
|-------|----------|-------|
| `id` | yes | selector on the CLI |
| `type` | yes | matches `toplist-structures/<type>.md` |
| `title` | yes | H1 / display title |
| `slug` | no | we pass it (else slugified from title); never GPT-generated |
| `sources` | no | external URLs to scrape for context |
| `category` | no | scope candidate sites to a category slug |
| `referenceSite` | no | site slug for similar-to / alternatives types (candidates = sites sharing its categories) |
| `includeReviews` | no | pass our reviews for the candidate sites as context (default false) |
| `maxEntries` | no | max ranked entries (default 10) |
| `categories` / `tags` | no | category/tag slugs to attach to the article |

## Usage

```bash
# dry-run (no writes) — inspect the generated JSON
node generate-toplists.mjs similar-to-brazzers --dry-run

# create one job as a draft (author required)
node generate-toplists.mjs similar-to-brazzers --author jane-doe

# all jobs, force re-create, publish immediately
node generate-toplists.mjs --all --author jane-doe --force --publish

# skip external scraping (use our data only)
node generate-toplists.mjs best-teen-pornstars-2026 --author jane-doe --no-scrape
```

Or via npm: `npm run generate-toplists -- <args>`.

## Pipeline

`scrape sources (Playwright)` → `consolidate + validate context (GPT-4o, drops gibberish/irrelevant pages)` → `generate article (GPT-5.5)` from the validated context + our catalog/reviews → `sanitize widgets to catalog IDs` → `re-host images` → `create draft Article`.

## Behavior

- Skips a job if an article with its slug already exists (unless `--force`).
- **Current year:** the article is written for the current year; stale years (2024/2025) from sources are normalized.
- **AVN awards:** performers mentioned in the consolidated context are matched against the cached AVN dataset (local lookup, no extra API cost); verified awards (with year) are passed to the model, which may only mention those — never invent one.
- **Images:** a cover image is picked from the sources and re-hosted (sets `coverImage`). For each ranked-site `<h2>`, the script inserts one image **above the heading**: it first matches a source image to that site (by alt/nearby-heading/filename, best size) and re-hosts it; if none matches, it falls back to that **site's own `cover_image`** from our content-type. The run logs per-site provenance (source-uploaded / our-cover / none).
- Embeds SiteCard/SiteList widgets only for sites in our catalog; a **sanitizer** strips any widget referencing an unknown site ID.
- FAQs are saved to the article's `faqs` component (NOT inline in content).
- "Similar to" / "alternatives" articles use clean editorial (prose, lists, pros/cons, attributed source quotes) — no SiteCard/CTA.
- Draft by default; `--publish` sets `publishedAt`.

> Inline image URLs are absolute to `STRAPI_URL`. For production runs, set `STRAPI_URL` to the public Strapi/media domain so the rewritten `<img>` URLs resolve for end users.

> Note (Strapi v5 draft/publish): `--publish` uses `PUT { publishedAt }`. If a published article doesn't surface the change, publish from the admin or extend the script with the document-service `publish()` (as used in the overallScore backfill).
