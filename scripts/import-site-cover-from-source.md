# Site Cover Import Script

## Script

- File: `scripts/import-site-cover-from-source.mjs`
- Source support: `PornDiscounts` only for now

## Requirements

- `STRAPI_TOKEN`
- `STRAPI_URL` is optional and defaults to `http://localhost:1339`

## What It Does

This script finds the cover image on a source review/deal page and uploads it into the Strapi `cover_image` media field for each site.

For `PornDiscounts`, it:

- resolves the review URL from an existing `reviewSources` entry when available
- otherwise falls back to the PornDiscounts sitemap and slug/name/network variants
- extracts the image inside `.discount-thumb`
- uploads that image to Strapi media
- assigns the uploaded media ID to the site's `cover_image` field

## Usage

```bash
node scripts/import-site-cover-from-source.mjs brazzers --source=porndiscounts
node scripts/import-site-cover-from-source.mjs --site=brazzers --source=porndiscounts --force
node scripts/import-site-cover-from-source.mjs --sites=brazzers,bangbros --source=porndiscounts
node scripts/import-site-cover-from-source.mjs --all --source=porndiscounts
node scripts/import-site-cover-from-source.mjs --all --source=porndiscounts --force
```

Use either `--all` or an explicit site list, not both.

## Behavior

- Without `--force`, sites that already have a `cover_image` are skipped.
- With `--force`, the site's `cover_image` relation is replaced with the newly uploaded image.
- Existing Strapi media files are not deleted; only the `cover_image` field assignment is updated.
- If no PornDiscounts URL can be resolved, the site is reported as a failure.
- If the source page has no `.discount-thumb img`, the site is reported as a failure.