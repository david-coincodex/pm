# Cancel-Guide Refresher

Refreshes our existing **"How do I cancel &lt;site&gt;?"** help articles. Each job points at the original article on our live site; the script scrapes it (copy + step **screenshots, in order**), GPT-5.5 lightly improves the wording while keeping the steps and screenshots in place, then it re-hosts the screenshots and creates a new Article with the **same slug**.

The cancellation steps, their order, and the screenshot→step mapping are preserved, but the copy is **analyzed and re-structured** into a clean guide: an intro, one `<h2>Step N: …</h2>` per step with the instruction followed by its screenshot, a "Things to know" list, and a closing line. The article's featured/hero (og) image is used only as the cover and is excluded from the body (no duplicate at the top).

## Files

- `generate-cancel-guides.mjs` — the script
- `cancel-prompt.md` — GPT system prompt (refresh-in-place rules; preserves `{{IMAGE_n}}` markers)
- `cancel-jobs.json` — jobs: `{ id, slug, site, siteName, source }` (`categories`/`tags` optional)

## How it works

1. **Scrape** the source article: title, body text with `{{IMAGE_1}}…{{IMAGE_n}}` markers inserted exactly where each screenshot sits, and the ordered list of screenshot URLs.
2. **Refresh** (GPT-5.5): rewrites the copy lightly, keeping every `{{IMAGE_n}}` marker in place and not inventing steps. Returns `{ title, metaTitle, description, contentHtml, faqs }`.
3. **Re-host** each screenshot to our media and swap the marker for an `<img>`; a cover is taken from the article's og:image (or first screenshot).
4. **Create** the Article with the same slug, inline screenshots, cover, and FAQs.

## Usage

```bash
# inspect one (no writes, no author needed)
node generate-cancel-guides.mjs cancel-brazzers --dry-run

# create drafts for specific jobs
node generate-cancel-guides.mjs cancel-brazzers cancel-bangbros --author mike-wood

# all jobs, replace existing same-slug articles, publish
node generate-cancel-guides.mjs --all --author mike-wood --force --publish
```

Or: `npm run generate-cancel-guides -- <args>`.

## Flags

`--all` · `slug/jobId …` · `--force` (replace same-slug article) · `--publish` · `--dry-run` · `--jobs <path>` · `--author <slug>` (required unless dry-run).

## Publish caveat (Strapi v5)

`--publish` uses a REST `PUT { publishedAt }`, which can be unreliable for the published version on v5. The robust path is the document service — see the note in `generate-faqs.md`, or publish from the Strapi admin.
