# Importing offers from the pricing sheet

`scripts/import-offers.mjs` populates the `offers` collection from a Google Sheet — one row per
offer. It is **idempotent**, so it is also the normal way to push a price change: fix the sheet,
re-run, done. Nothing is duplicated.

```bash
node scripts/import-offers.mjs                      # dry run against the live sheet
node scripts/import-offers.mjs --apply              # write
node scripts/import-offers.mjs --csv ./offers.csv   # use a local export instead
node scripts/import-offers.mjs --apply --prune      # also deactivate offers dropped from the sheet
```

Needs `STRAPI_URL` and `STRAPI_TOKEN` in `scripts/.env`. Dry run is the default and prints exactly
what would change.

## The table

Default sheet: `11xvoXDz77-w0zYY986bH67KKaYeJ7GJmJfKajdoYTSQ` (override with `--sheet <id> --gid <n>`).
It must be shared as **anyone with the link can view**, or the CSV export 404s.

Columns are read **by position**, so keep the order. Column 4 (index 3) is unused — leave it empty.

| # | Header | Required | Notes |
|---|---|---|---|
| 1 | `site` | yes | Site **name or slug** as it appears in the CMS. See [Naming](#naming). |
| 2 | `offerKind` | yes | `subscription` or `credits`. Nothing else. |
| 3 | `offerType` | yes | For `subscription`: `trial` / `monthly` / `quarterly` / `yearly` / `lifetime`. For `credits`: **the pack size as a number** (`550`). |
| 4 | *(unused)* | — | Leave blank. |
| 5 | `price` | yes | What the customer pays, e.g. `9.95`. Numbers only — no `$`. |
| 6 | `full_price` | no | Undiscounted price. Drives the discount badge; omit and no badge shows. |
| 7 | `allowDownloads` | no | `Yes` / `No` / blank → `allowsDownloads` boolean. |
| 8 | `affiliateLink` | yes | Full `https://…` URL. |

Example:

```csv
site,offerKind,offerType,,price,full_price,allowDownloads,affiliateLink
Brazzers,subscription,monthly,,9.99,29.99,No,https://landing.brazzers.com/?ats=…
Brazzers,subscription,yearly,,119.88,359.88,Yes,https://landing.brazzers.com/?ats=…
Chaturbate,credits,550,,49.99,109.45,,https://chaturbate.com/in/?tour=…
```

### Two gotchas that have actually bitten

**Commas inside links.** Some affiliate URLs end in `,18`. Google Sheets quotes the field on
export and the importer parses quotes correctly — but a naive comma-split does not, which is worth
knowing if you write your own tooling against this file.

**Credit packs are not an `offerType`.** The schema's `offerType` is an enum, so `550` is not a
legal value. The importer moves the pack size into the integer `credits` field and sets
`offerType: 'credits'`. That is what the UI reads to render *"550 credits — $49.99"*. Put the
number in the `offerType` column anyway — the mapping is automatic.

## Naming

The `site` column is matched against site **slug** first, then **name**, punctuation-insensitively
(`Thai Swingers` → `thai-swinger`). For display names that will not resolve, add an entry to
`ALIASES` at the top of the script:

```js
const ALIASES = {
  kinkcom: 'kink',          // sheet says "Kink.com", CMS site is "Kink"
  thaiswingers: 'thai-swinger',
};
```

Keys are the normalised sheet name (lowercase, alphanumerics only). A row whose site cannot be
resolved is **skipped and reported** — never guessed at.

## What it writes

Each row becomes one `offer` with `isActive: true` and `priority: 10` (the schema default).
`offers` has `draftAndPublish: false`, so there is no publish step.

An offer's identity is **(site, offerKind, offerType, credits)**. On re-run:

- new identity → created
- same identity, changed price / full_price / link / downloads → updated in place
- same identity, nothing changed → left alone
- `--prune` additionally sets `isActive: false` on active offers no longer present in the sheet
  (it deactivates rather than deletes, so history and any inbound references survive)

## Rows that get skipped

Reported with a line number, never imported silently:

- blank site, or a site name that resolves to nothing
- `offerKind` that is not `subscription`/`credits`
- `offerType` outside the enum (subscriptions), or a non-numeric pack size (credits)
- missing `price`
- missing or non-`http(s)` `affiliateLink` — the schema requires it, and an offer without one
  renders a dead buy button

## Warnings — read these before trusting the prices

Printed under **WORTH A LOOK**. These rows *are* imported; the sheet is the source of truth and the
script never silently "corrects" a figure. Fix the sheet and re-run.

- **price is 0** — renders as 100% off. Fine for a genuine free-credits offer, otherwise a typo.
- **no full_price** — no discount badge will appear.
- **full_price < price** — negative discount.
- **yearly full_price > 15× the monthly full_price** — the double-annualisation slip. Monthly full
  × 12 is the yearly full; multiplying the *already annual* figure by 12 again produces a number
  that passes every other check. This is how Mofos shipped as `$4318.56` instead of `$359.88`.

## After importing

Bust the frontend cache so prices appear:

```bash
curl -X POST -H "x-revalidate-secret: $REVALIDATE_SECRET" http://localhost:3002/api/revalidate/
```

If pages still show stale prices in local dev, recreate the container —
`docker compose up -d --force-recreate frontend`. A plain `restart` keeps the `.next` cache.

Then spot-check a subscription site, a cam site, and a category page. Note that prices render as
`$<!-- -->9.99` in the HTML source (React inserts a text-node marker), so grep for the number, not
`$9.99`.

## Scope

The sheet covers **main sites** (no `parent_site`). Subsites/channels have no offers of their own
and inherit nothing — their cards show no price by design. If a channel ever needs its own offer,
add it as an ordinary row; nothing in the script restricts it to mains.
