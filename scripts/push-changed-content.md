# Incremental content push (local → staging)

`push-changed-content.mjs` pushes **only new/changed entries and only new media files** from
local to staging over REST. It complements `sync-content-to-staging.mjs`, which is a **full
replace** — `strapi transfer` re-streams every entity and every asset (~385 MB) each run and
has no delta mode. Day-to-day pushes go through this script; keep the transfer script for
full resyncs (e.g. after a schema change, or if the two sides have drifted beyond trusting a
diff).

```bash
cd scripts && export $(cat .env | xargs)
node push-changed-content.mjs                  # DRY RUN — full diff + approval report, nothing written
node push-changed-content.mjs --apply          # push new/changed entries + new files
node push-changed-content.mjs --apply --prune  # also delete staging-only entries
```

## The approval report

Every run with something to push writes a markdown report to
`scripts/data/push-reports/push-report-<ts>.md` (gitignored) **before** anything is written:

- **NEW** entries with their natural key, human title, and publish state;
- **CHANGED** entries with a field-level diff — which fields differ, with truncated
  before → after previews (relations/media compared by name, components by item count);
  a timestamps-only change is called out as a no-op re-write;
- new media files (with alt text), staging-only files, and — with `--prune` — exactly what
  would be deleted.

The workflow is: dry run → review/approve the report → `--apply` (the PUSH confirmation
references the report path). Publish state in the report and in the write logic comes from
the published-version set, NOT from `publishedAt` on the draft fetch — that field is always
null on a `status=draft` read of a draft&publish type (measured; trusting it would have made
every write silently skip `?status=published`).

Flags: `--only <plurals>`, `--yes` (skip the PUSH confirmation), `--port <n>`, `--keep-proxy`.

`--only` restricts what gets **written** — every collection is still diffed, because the
documentId map must be complete for the HTML rewrites (with `--only articles`, an article
whose widgets reference a new site would otherwise keep the local id and render empty).

## Requirements

- `STAGING_STRAPI_TOKEN` in `scripts/.env` — a **Full access API token** minted in the staging
  admin (Settings → API Tokens). The transfer token cannot serve REST. Without it the script
  refuses to run: the diff needs `status=draft` reads and the push needs writes.
- `CF_ACCESS_CLIENT_ID/SECRET` (staging sits behind Cloudflare Access; the script starts its
  own header-injecting proxy, same as the transfer script).
- Local `STRAPI_URL`/`STRAPI_TOKEN`.

## How the diff works

- **Entities match by natural key, never documentId**: REST refuses client-supplied
  documentIds (measured: `Invalid key documentId`), so an entity created locally gets a
  *different* documentId when pushed. Keys: `slug` for most types, `name` for
  platforms/featureds, the site's slug for reviews, `(site, offerKind, offerType, credits)`
  for offers.
- **Changed** = local `updatedAt` strictly newer than staging's. A push stamps staging's own
  `updatedAt` (newer than local's), so pushed entries settle as unchanged — the diff is
  idempotent, and a staging-side hand edit (also "newer") never gets silently clobbered.
- **Files match in three tiers**: content `hash` (preserved by `strapi transfer`), then
  `(name, size)`, then `(name, mime)` picking the oldest candidate with a warning when several
  share the name. The third tier exists because a REST upload mints a fresh hash on the
  destination **and staging re-optimizes images on upload**, so even the stored size drifts
  (measured: every re-pushed jpg) — without it, previously-pushed images re-upload on every
  run, forever. A file matched by any tier is **never re-uploaded**.
- **Staging-only entries are reported, not deleted** — `--prune` deletes them after the
  confirmation.

## How the push works

1. New files upload first (binary fetched from local `/uploads`, POSTed to staging with its
   `alternativeText`/`caption`); the hash/name matches plus these uploads form the
   file-id and file-URL maps.
2. Entities go in dependency order (`platforms … sites, bundles, offers, commercials, reviews
   … articles` last — bundles before offers/sales, which own relations to them), each rebuilt
   from the local full entity via the backend schema JSONs (attributes marked
   `writable: false` — lifecycle-computed fields like `review.overallScore` — are skipped;
   REST rejects them and the destination recomputes them anyway):
   - media fields → staging file ids through the map;
   - owning-side relations → staging documentIds (inverse `mappedBy` sides are skipped). A
     relation whose target is itself being created later in the same run (self-references
     like `site.parent_site`) is deferred and linked with a follow-up PUT once everything
     has a staging id;
   - components/dynamic zones → copied with the component instances' own `id`s stripped;
   - **strings are rewritten everywhere** — top-level fields, inside components, and inside
     `json`/`blocks` values — through the documentId map and the file-URL map (original URLs
     **and format variants** like `medium_…`, since staging regenerates formats under its own
     hash). One alternation-regex pass, so a replacement can never chain into another.
     Upload-file objects embedded in blocks are remapped to staging ids too. This is what
     keeps widget markup (`data-commercial-id="…"`, `data-site-id="…"`) and `/uploads/…` URLs
     valid on staging; articles are pushed last so their referenced entities are mapped first.
3. New → POST, changed → PUT by the mapped documentId — with `?status=published` when the
   entity is published locally (the repo has measured both "POST auto-publishes" and "PUT
   updates the draft only", so neither is assumed; `status=published` writes both versions,
   the established `seed-info-pages.mjs` pattern). **Locally-unpublished entities are pushed
   as drafts** and stay unpublished on staging. Writes are single-attempt on purpose (a
   retried half-landed POST would double-create), and a published version is read back after
   each write as a sanity check.
4. `--prune` deletes staging-only entries AFTER all pushes, in reverse dependency order.
5. Verify re-runs the diff for the touched collections — it must come back clean.

## Guards (hard refusals, not warnings)

- A backend collection missing from the script's `PUSH_ORDER` (it would silently never push).
- More than one i18n locale (REST reads return the default locale only — non-default locales
  would silently never diff; use the full transfer).
- Duplicate or empty natural keys on either side (the diff would pair the wrong entities and
  PUT one over another).
- A component schema containing a media field (no remap path).

A run that dies mid-push is safely **resumable**: just run it again. Entities already created
re-match by natural key and settle as unchanged; already-uploaded files match by hash or name.
(Measured: the first real run failed midway on `overallScore`, and the re-run completed
cleanly from where it left off.)

## Limitations (by design)

- **Edits to an existing media file never propagate**: a locally re-exported/edited file with
  an unchanged filename matches the staging copy by name and is skipped — staging keeps the
  old bytes indefinitely. Same for later `alternativeText`/`caption` edits (sent only at
  first upload). Replace the file on staging manually or run the full transfer.
- **Renames change identity**: renaming a slug/name locally arrives as a NEW entity, and the
  old one lingers as `only-on-staging` until a `--prune`. There is no rename detection.
- **Draft/published divergence is not preserved**: the local draft state is what gets written
  (published when the entity is published locally, draft otherwise). A local *unpublish* of a
  still-published staging entity is not mirrored — REST has no unpublish; do it in the
  staging admin (the push warns).
- **Staging-only files** are reported but never deleted, not even by `--prune`.
- **Upload folders** are not recreated (folder management is admin-API only); files land in
  the media library root on staging.
- No config/settings/users of any kind — REST content endpoints only.

## When NOT to use this

After a **schema change** (staging must get the code deploy first — the diff reads the local
schema JSONs and writes fields staging may not have yet), or when staging content is
untrusted/diverged and should simply be replaced: use `sync-content-to-staging.mjs` then.
