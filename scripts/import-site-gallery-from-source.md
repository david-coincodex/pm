# Site Gallery Import Script

## Script

- File: `scripts/import-site-gallery-from-source.mjs`
- Source support: `DiscountedPorn` only for now

## Requirements

- `STRAPI_TOKEN`
- `STRAPI_URL` is optional and defaults to `http://localhost:1339`

## What It Does

This script finds gallery/sample images on a source deal page and uploads them into the Strapi `gallery` media field for each site.

For `DiscountedPorn`, it:

- resolves the deal URL from an existing `reviewSources` entry when available
- otherwise falls back to the DiscountedPorn sitemap and slug/name/network variants
- scrapes the main image in `.media-wrapper` plus the thumbnail images in the adjacent image row
- uploads those images to Strapi media
- assigns the uploaded media IDs to the site's `gallery` field

## Usage

```bash
node scripts/import-site-gallery-from-source.mjs brazzers --source=discountedporn
node scripts/import-site-gallery-from-source.mjs --site=brazzers --source=discountedporn --force
node scripts/import-site-gallery-from-source.mjs --sites=brazzers,metart --source=discountedporn
node scripts/import-site-gallery-from-source.mjs --all --source=discountedporn
node scripts/import-site-gallery-from-source.mjs --all --source=discountedporn --force
```

Use either `--all` or an explicit site list, not both.

## Behavior

- Without `--force`, sites that already have gallery images are skipped.
- With `--force`, the site's `gallery` relation is replaced with the newly imported images.
- Existing Strapi media files are not deleted; only the `gallery` field assignment is updated.
- If no DiscountedPorn deal URL can be resolved, the site is reported as a failure.
- If the source page has no gallery images, the site is reported as a failure.