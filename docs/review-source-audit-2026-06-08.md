# Review Source Audit

Date: 2026-06-08

## Coverage Snapshot

- Active sites: 323
- Sites with at least one external review source: 304
- Sites without any external review source: 19
- Coverage: 94.1%

### Source Coverage

- PornDiscounts: 271 sites
- RabbitsReviews: 265 sites
- PornInspector: 206 sites
- TheBestPorn: 197 sites
- AdultReviews: 188 sites
- DiscountedPorn: 159 sites
- MrPornGeek: 70 sites

## Audit Scope

This audit started from the 22 active sites that had zero `reviewSources` after adding `DiscountedPorn` and `PornDiscounts`, then reran discovery after extending sitemap-backed lookup.

The audit compared those sites against:

- `https://www.discountedporn.com/sitemap.xml`
- `https://www.porndiscounts.com/sitemap-discounts-discounts.xml`
- `https://www.rabbitsreviews.com/sitemap.xml` and its child sitemaps
- `https://www.thebestporn.com/sitemap.xml` and its child sitemaps
- `https://www.mrporngeek.com/sitemap_index.xml` and its `sites-sitemap*.xml` files
- `https://www.porninspector.com/sitemap.xml`

AdultReviews declares `https://www.adultreviews.com/sitemap.xml` in `robots.txt`, but that endpoint currently returns no sitemap content, so there was no usable sitemap-backed dataset to add for AdultReviews.

## Findings

### 1. Recovered by sitemap-backed lookup

These three sites were recovered and saved after adding sitemap-backed lookup plus `and`/`&` normalization:

- `penny-show` -> TheBestPorn `https://www.thebestporn.com/review/pennyshow/`
- `fakehub-originals` -> RabbitsReviews `https://www.rabbitsreviews.com/porn/reviews/fake-hub-originals`
- `busty-real` -> TheBestPorn, RabbitsReviews, PornInspector, DiscountedPorn, PornDiscounts

### 2. Still only network-level evidence

These sites have network or parent-brand matches in one or more providers, but not a dedicated subsite page that the current exact-match discovery policy can safely use:

- `kissing-sis` -> team-skeet / teamskeet
- `teamskeet-allstars` -> team-skeet / teamskeet
- `teamskeet-selects` -> team-skeet / teamskeet
- `girlsway-originals` -> girls-way / girlsway
- `girl-faction` -> bad-daddy-pov / baddaddypov
- `isan-unseen` -> thai-swinger / thaiswinger
- `famedigital-network` -> devils-film / devilsfilm
- `cash-fetish` -> fetish-network / fetishnetwork

These are the strongest candidates for an optional network-level fallback mode, if that policy is accepted.

### 3. Still no exact page match after rerun

These sites still do not have any saved `reviewSources` after extending the resolver layer and rerunning discovery:

- `chongas`
- `newbie-black`
- `power-munch`
- `bangbros-vault`
- `brazzers-exxtra`
- `zz-series`
- `brazzers-en-espanol`
- `mofos-b-side`
- `mofos-lab`
- `ebony-sex-tapes`
- `kissing-sis`
- `teamskeet-allstars`
- `teamskeet-selects`
- `girlsway-originals`
- `project-rv`
- `girl-faction`
- `isan-unseen`
- `famedigital-network`
- `cash-fetish`

For these, the remaining evidence is either network-level only or absent from the available sitemap-backed sources.

## Recommendations

1. Keep the sitemap-backed lookup for TheBestPorn, RabbitsReviews, MrPornGeek, and PornInspector.
2. Leave AdultReviews on its existing probe-based logic unless its sitemap becomes accessible.
3. Decide whether network-level review pages are acceptable fallbacks for subsites and branded subdivisions.
4. If network-level fallbacks are accepted, add a guarded fallback mode that only uses them when no exact page match exists.
