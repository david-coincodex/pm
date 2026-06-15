# FAQ Generator

Generates FAQs with GPT-5.5 for sites that have a **published review** (the review is the factual basis) and writes them to the localized `faqs` component on both content-types:

- **review.faqs** — content/experience focused (niche, library size, video quality, updates, strengths/weaknesses, who it's for).
- **site.faqs** — deal/offer focused but **durable** (is the deal legit, what's included, billing/cancellation, devices, is it worth it).

Volatile facts — exact price, discount %, payment methods, trial, downloads — are **not** generated here. They render dynamically at request time from live offers via `frontend/src/lib/dynamicFaqs.ts`, so they never go stale when offers change. The site FAQ deliberately avoids hard numbers.

## Files

- `generate-faqs.mjs` — the script
- `faqs-site-prompt.md` — system prompt for the deal/offer FAQs
- `faqs-review-prompt.md` — system prompt for the content/experience FAQs

## Requirements

`STRAPI_TOKEN`, `OPENAI_API_KEY` in `scripts/.env`. `STRAPI_URL` defaults to `http://localhost:1339`.

## Usage

```bash
# dry-run a single site — inspect the generated JSON, no writes
node generate-faqs.mjs brazzers --dry-run

# write FAQs (drafts) for specific sites
node generate-faqs.mjs brazzers reality-kings

# every site that has a published review
node generate-faqs.mjs --all

# only one flavour
node generate-faqs.mjs brazzers --review-only
node generate-faqs.mjs brazzers --site-only

# overwrite existing FAQs, publish immediately
node generate-faqs.mjs --all --force --publish

# cheapest for big runs: OpenAI Batch API (~50% off, async) — submits one job, waits, writes
node generate-faqs.mjs --all --batch --publish
```

Or via npm: `npm run generate-faqs -- <args>`.

## Flags

| flag | effect |
|------|--------|
| `--all` | process every site with a published review |
| `slug …` | process only these site slugs |
| `--site-only` / `--review-only` | restrict to one flavour |
| `--force` | overwrite existing FAQs (default: skip a target that already has FAQs) |
| `--publish` | publish the updated draft (see caveat) |
| `--batch` | generate via the OpenAI Batch API: **~50% cheaper**, asynchronous. Submits all sites as one job, polls until complete (minutes–hours), then writes/publishes. Ideal for `--all`. Mutually exclusive with `--dry-run`. |
| `--dry-run` | print generated JSON, no writes |

## Behavior

- One combined GPT-5.5 call per site (shared context), emitting `{ siteFaqs, reviewFaqs }`; only the requested keys are written.
- Skips a target whose `.faqs` already has entries unless `--force`.
- FAQs are written to the `faqs` component as `{ question, answer }` (same shape as the toplist generator).
- Cost is logged per site and summarized.

## Publish caveat (Strapi v5)

A REST `PUT { publishedAt }` updates the **draft** version; for content that is already live this may not surface until the document is published. `--publish` uses that PUT for consistency with the other generators, but the robust path is the document service. Run from `backend/` (loads Strapi without binding the port):

```bash
node -e "require('@strapi/strapi').createStrapi().load().then(async a=>{ \
  await a.documents('api::site.site').publish({documentId:'…'}); \
  await a.documents('api::review.review').publish({documentId:'…'}); \
  process.exit(0)})"
```

…or simply publish from the Strapi admin.

## Rendering

- **Discounts page** merges dynamic offer FAQs ahead of `site.faqs`:
  `<FaqSection faqs={[...buildDynamicFaqs(site), ...(site.faqs ?? [])]} bare />`, rendered directly below the platform-info block.
- **Review page** renders `review.faqs` (content only) below the platform-info block.
- Both use the existing `FaqSection`, which emits FAQPage JSON-LD.
