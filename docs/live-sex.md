# /live-sex — the live-cam aggregator

How the cam segment works end to end: where data lives, which cron jobs run, how data is
purged, and what it takes to deploy/transfer to staging and production. Everything described
here ships on branch `43`.

## The three data stores

| Store | Lives where | Written by | Lifetime |
|---|---|---|---|
| **Live snapshot** | Frontend process memory (`globalThis`) | Feed poller, every 45 s | Until next refresh; rebuilt on boot |
| **Model registry** (`cam-model`) | Strapi DB (SQLite dev / Postgres staging+prod) | `POST /api/cam-models/sync`, every ~5 min | 60 days after last seen online |
| **Model photos** | Strapi media library (folder **Cam Models**, `strapi_public` volume) | Hourly backend cron | Deleted with their model |

There is **no filesystem thumb store anymore** — the old `cam_thumbs` volume, `/cam-thumb/`
route and `lib/cams/thumbStore.ts` were retired on this branch. Covers hotlink the provider
CDNs; durable imagery lives in the media library.

### 1. Live snapshot (`frontend/src/lib/cams/registry.ts`)

The runtime source of truth for *who is streaming right now*. An unref'd poller fetches every
enabled provider feed every 45 s (Chaturbate affiliate JSON, 4×500 rows; BongaCams promo API,
7×300 rows — page sizes chosen to stay under Next's 2 MB data-cache ceiling per response;
ImLive host-list API, one request, free-chat rooms only; StripChat via the Stripcash
aggregators API, one request, public rooms only, capped at the 2,000 biggest). A provider is enabled when its
credentials are set (`adapter.enabled()`), so an unset key skips the provider instead of
breaking the snapshot. Guarantees:

- Readers never wait inside the 45 s TTL; a hard 5-minute bound blocks rather than serve older data.
- `instrumentation.ts` warms the snapshot at boot, so freshness never depends on traffic.
- Every refresh logs `[cams] snapshot refreshed: N models`; a tripwire warns when content
  repeats across 4 refreshes (frozen-feed detector — this fired during the data-cache incident).
- Feed fetches are `no-store` at runtime (`providers/feedCache.ts`); only the build phase caches them.

### 2. Model registry (`backend/src/api/cam-model/`)

The persistent record of *every model the feeds have ever carried*. It exists so that:

- `/live-sex/<site>/<user>/` (e.g. /live-sex/bongacams/LennaGodess/) can 404 for usernames that never existed while
  offline-but-known models keep an indexable page with "Last online X ago";
- `models-sitemap.xml` can enumerate the SEO surface;
- gallery photos have an entity to attach to.

**Write path** — `frontend/src/lib/cams/modelSync.ts` rides the snapshot refresh,
throttled to one POST per 5 minutes, single-flight,
skipped during builds. The backend (`controllers/cam-model.ts # sync`) writes in two tiers:

- `lastSeenAt` is **bulk-touched for the whole online roster every sync** (chunked raw Knex
  `UPDATE`s — uniform value, so per-row writes buy nothing). It is exact to the sync cadence;
  the sitemap `lastmod`, the "Last online X ago" hint and the activity tail patch rely on that.
  The bulk touch deliberately skips `updated_at`.
- Full rows are diffed against existing rows (`$in` chunks of 500) and only written when
  **new**, **an hour stale** (`updatedAt`-gated, `ROW_REFRESH_SLACK_MS`), **beat their
  peak-viewers record**, **changed identity** (name/gender/country/profile URL), or **started
  a new session** (`onlineSince` moved beyond `SESSION_TOLERANCE_MS` vs the stored
  `wentOnlineAt`). Full writes also fold the sighting into the `activity` session-history
  json (`session-history.ts`) that feeds the model page's usual-online-hours heatmap
  (`frontend/src/lib/cams/activity.ts` + `CamActivityHeatmap`). Steady state is a few hundred
  single-row writes per sync; a byte-identical replay writes nothing beyond the bulk touch.

Writes go through `strapi.db.query`, **not** the documents service — on purpose: no bulk API
exists, each documents-service write walks the `normalizeMediaUrls` middleware, and each
emits webhooks (hundreds of `/api/revalidate` calls per sync). Raw-layer creates must set
`publishedAt` explicitly; `documentId` and timestamps are automatic.

**Read path** — `frontend/src/lib/cams/modelDb.ts`:

- `findKnownModel` (public REST `find`, key filter, photos populated) — the model page's
  existence gate. Three-way result on purpose: `missing` → 404; `error` (Strapi down) →
  **fail open** to the offline render with `noindex`, never a mass-404 of indexed pages.
- `GET /api/cam-model-keys?page=N` — 20k rows per page + a `total` (the core REST `find` is
  hard-capped at 100/page; unpaged it hit 4.7 MB within a day). Insertion-ordered so a model's
  sitemap chunk stays stable between crawler fetches; each page maps 1:1 onto a
  `models-sitemap.xml?page=N` chunk.

### 3. Photos (upload plugin, folder "Cam Models")

Per model, up to **4 images**: the profile portrait where the feed has one (BongaCams, ImLive;
Chaturbate has none) plus rotating live-snapshot captures (Chaturbate, BongaCams — ImLive's
"thumb" IS its static portrait, so snapshotting it is disabled in the provider kernel). Ingestion is cron-drained, not inline in the sync request —
restart-safe, and slow third-party fetches never block the request path. The pending queue is
the DB itself: `profileImageUrl != profileImageIngestedUrl` means "not ingested yet"
(the marker is stamped even on failure so a dead URL can't starve the queue).

Downloads go through the upload plugin's `fetchUrlToInputFile` (built-in SSRF IP blocklist,
timeout, 1 MB size check — header-based, i.e. advisory; safe because hosts are pinned) plus
a strict host allowlist: `thumb.live.mmcdn.com`, `i.bgicdn.com`.
Files land on the `strapi_public` volume and are served through the Traefik `/uploads` router
on the public host (content-hashed names, so the 1-year cache header is safe under rotation).

## Adding a provider

Providers are self-contained plugins; shared code holds no provider branches. The mechanical
part is small — the judgement calls below it are where the last four integrations actually went
wrong before they went right.

### The mechanical part

1. `frontend/src/lib/cams/providers/<name>/` — `meta.ts` (facts as data), `feed.ts`
   (server-only fetch + normalize + `outboundUrl`), `Player.tsx` / `Preview.tsx` (or omit for
   photo-only), `index.ts`. Add the id to `providers/ids.ts`, the meta to `providers/meta.ts`,
   the video plugin to `providers/video.ts`, the adapter to `providers/adapters.ts` —
   `Record<CamProvider, …>` makes the build fail until all exist.
2. One entry in `backend/src/api/cam-model/providers.json` (the backend kernel — photo hosts,
   capability flags, optional `retentionDays`; everything backend derives from it).
3. The id in the two Strapi enums: `cam-model.provider` and `cam-category.providerKey`
   (literal by necessity — Strapi reads schemas statically). **Strapi caches schemas**: restart
   the backend or the enum still rejects the new id.
4. Env for its credentials — `docker-compose.yml`, `docker-compose.prod.yml`, the deploy
   workflow's env block AND its `.env.deploy` echo, then `gh secret set … --env <env>`. A
   secret gets no default so an unset key simply hides the provider; a public affiliate id
   (it ships in every outbound URL) gets a baked default.
5. Affiliate template verified per `docs/cam-affiliate-links.md`, then
   `node scripts/check-provider-parity.mjs` — it asserts frontend meta ≡ backend kernel ≡ both
   enums, and the compiler names anything else forgotten.
6. Content LAST: the provider's cam-category row is pushed only after the deploy that ships the
   enum, else the push 400s. Until the feed is enabled the row hides itself
   (`getCamCategories` filters provider categories by `enabledProviders`), so it is safe to
   create early and push late.

### Categorisation — the part that gets skipped

A provider whose models reach no categories is invisible on the pages that carry search
traffic. **Measure coverage before declaring the integration done**: what share of its rooms
match at least one `tag` category? Real numbers from this codebase — ImLive 92%, StripChat 99%,
Chaturbate 72%, and BongaCams 31% until it was fixed.

The trap is assuming a provider's own tags are the categorisation source:

- BongaCams ships **20 tags per model** that describe ACTS (`dildofucking`, `cock-sucking`,
  `dancing`) and almost nothing about the model. Its attributes lived in separate profile
  fields (`ethnicity`, `hair_color`, `bust_size`, `butt_size`, `pubic_hair`, `display_age`,
  `is_vibratoy`) that we ignored for months.
- StripChat ships ~67 tags per model over 835 slugs, prefixed by niche (`girls/asian`), and its
  profile-attribute fields are null on the aggregator endpoint.
- ImLive ships no tags at all — only structured attributes.

So: find where the attributes actually live, map them to OUR vocabulary (the `matchTags` of the
`tag` cam-categories) with an explicit table, and **build that table from a measured sample** —
every provider map in this repo carries the observed value counts next to its keys. An
unmapped value must produce no tag rather than a guess. Two rules worth stating because both
were nearly broken: never emit a provider's raw taxonomy wholesale (the sync caps tags at 20,
and the chips become noise), and never map a field that does not mean what it looks like —
StripChat's `sexual_preference` is "bisexual" for 73% of rooms, which would file most of the
roster under gay/bi on the strength of a preference checkbox.

### Ranking and the viewer badge

`ranking.viewersComparable` says whether the provider's count is a real concurrent audience.
True for Chaturbate (`num_users`, median 137), BongaCams (`members_count`, median 96) and
StripChat (`viewersCount`, max 4,659) — those compete on the raw number and show the badge.
False for ImLive, whose number is guests in a free room (0–7): it is ranked editorially at
`mixShare` cadence and its cards hide the badge rather than print a misleading "0". Sorting a
non-comparable number against real ones put ImLive's best room at global rank 800 of 890, which
is how the flag came to exist. The same flag also gates the backfill's `MIN_PEAK`, since a
viewer threshold cannot filter a number that is not an audience.

### Similarity is cross-provider by construction

"Similar" and "Next" compare only tags that exist in our shared vocabulary
(`crossProviderTags`). A provider's private words otherwise act as a provider marker — ImLive
stamps every room `free chat`, BongaCams describes acts nobody else uses — and the model page
ends up recommending the cam site the visitor is already on. Provider, gender and language
categories never participate in similarity.

### Compliance is a data decision, not a code decision

Read the provider's aggregator terms and express them as kernel facts, so the crons obey them
without knowing the provider exists:

- **Images that may not be downloaded** → `hasProfilePortrait: false`, `liveSnapshots: false`,
  `photoHosts: []`. That is what keeps the ingest crons away (their provider lists derive from
  those flags). Leave `photoHosts` empty even though the frontend emits those hosts: putting
  never-downloaded hosts in an SSRF allowlist would pre-authorise the forbidden fetch, and the
  parity check now treats a no-ingest provider as the deliberate exception.
- **A stricter deletion window** → `retentionDays` in the backend kernel. `cleanupExpired`
  groups providers by effective window and sweeps each on its own cutoff (StripChat is 30 days
  against the house 60).
- **Geo restrictions** → drop those rooms in the feed. Our pages are one statically cached
  document for every country, so per-viewer filtering is not available; log the dropped count
  so the cost stays visible (StripChat drops ~62% of public rooms and still fills its cap).

### Playback

Three shapes exist, and the plugin contract is what makes shared code inherit monetisation and
controls rather than silently miss them:

- **Plain HLS** (BongaCams, StripChat) — `HlsSurface`/`HlsPreview` one-liners,
  `ownsControls: false`, `canPlay: (m) => Boolean(m.streamUrl)`. Verify the WHOLE chain from a
  non-datacenter IP: master → variant → segments, each `200` with `access-control-allow-origin:
  *`. Chaturbate's tokens turned out IP-bound once; that failure only appears in production.
- **Provider iframe** (Chaturbate) — `ownsControls: true`, since our bar cannot reach a
  cross-origin player.
- **Provider SDK** (ImLive) — expect to fight it. Theirs pauses on tab-hide and resumes live
  video from a stale buffer, and its `onUserGestureMade()` silently re-requests the stream, so
  calling it on a healthy instance kills playback. Keep such quirks in the provider directory
  (`imlive/useLiveRecovery.ts`), never in the shared host.

Also check whether the feed publishes a session start (`seconds_online` or similar). If it does
not, nothing breaks: the sync stamps `wentOnlineAt` from our own first sighting, which drives
both the "Live for" pill and the heatmap.

### Verification before merge

`check-provider-parity.mjs`, both `tsc` runs, ESLint, the affiliate grep gate, and the saved
cam-video regression suite for the EXISTING providers (a new provider must not disturb them).
Then in a real browser: hub page, model page playback, hover preview, mute, `/out/` redirect
equal to the template (live + punctuated username + offline + garbage→404), viewer badge,
category coverage, and the sync writing sane rows.

## Cron jobs

All backend crons are Strapi built-ins — `config/server.ts` → `cron.tasks`, implemented in
`backend/src/cron/cam-model-tasks.ts`. No external scheduler, nothing to install on servers.
Every cron (and the roster sync) sends a dead-man's-switch heartbeat to Healthchecks.io on
completion — silence or `/fail` triggers the alert. See **docs/monitoring.md**.

| Job | Schedule | What it does |
|---|---|---|
| `cam-model-profiles` | hourly (`12 * * * *`) | Ingest ≤300 pending BongaCams profile photos, but only for models seen in the last 48 h — the floor bounds the backlog to the active population (and keeps ingestion away from rows cleanup is about to delete). Dead URLs are marked attempted so they can't clog the queue. |
| `cam-model-snapshots` | hourly (`32 * * * *`) | Capture live snapshots for ≤150 recently-online models: ≤100 first-timers plus a **reserved refresh share** for the longest-uncaptured (without it, daily churn means no model ever collects a second photo). Rotates to 4 photos/model. |
| `cam-model-activity-backfill` | every 10 min (`*/10 * * * *`) | **One-shot** import of usual-online-hours history from lemoncams' public cam-log (150 rows/tick, id-cursor + done flag in the core store — a finished backfill costs one store read per tick forever after). Idempotent set-union merge into `activity`; skips organically-rich rows; failure circuit breaker. See `api/cam-model/activity-backfill.ts`. |
| `cam-model-cleanup` | daily (`0 4 * * *`) | Delete models with `lastSeenAt` older than **60 days** (`CAM_MODEL_RETENTION_DAYS` overrides, for testing). Photos are removed through the upload service FIRST — Strapi never cascades media, a bare row delete would orphan files — then the row. Failed rows are excluded from re-queries so one poisoned row can't wedge the loop; a run aborts after 500 failures. |

Sizing note: the registry grows by **~33k newly-seen models per day** (measured — churn, not
roster size), so at 60-day retention expect hundreds of thousands of rows. All cron queries
and the keys endpoint are bounded with that number in mind; shared constants (slack, online
window, photo cap, retention) live in `backend/src/api/cam-model/constants.ts` with their
invariants documented.

Frontend-side "crons" are just the snapshot poller (45 s) and the piggy-backed model sync
(5 min) — both start automatically with the server process.

## How data is purged

- **Models**: unseen 60 days → daily cron deletes photos + row → the page 404s and the URL
  drops out of the sitemap in the same stroke. Nothing else references the row.
- **Photos**: rotation keeps ≤4 per model (oldest removed via `upload.remove`, which deletes
  the provider file, generated formats, and the DB row together); the rest die with the model.
- **Live snapshot**: memory only; every refresh replaces it.
- There are no other retention mechanisms to run — and the ones above are heartbeat-monitored
  (docs/monitoring.md), so a stalled cleanup alerts instead of silently growing the registry.

## URLs, SEO and the proxy bridge (frontend)

- Canonical pages are **path-based and statically rendered**: the hub `/live-sex/`, one page
  per category `/live-sex/<slug>/` (genders, tags, cam sites, languages), and model pages
  nested under their provider's category slug: `/live-sex/<site>/<username>/`
  (`/live-sex/bongacams/LennaGodess/`; slug↔provider mapping owned by
  `lib/cams/types.ts # CAM_PROVIDER_SLUGS`). Two-segment paths route to the model page,
  one-segment to categories, three (`/page/N`) to internal pagination — no collisions.
  `/live-sex/female/` 308s to the hub (it *is* the default view).
- Multi-facet states use the readable query grammar
  `/live-sex/?site=chaturbate&gender=female,couples&tags=milf,teen&language=german`
  (`lib/cams/filters.ts` owns the word↔key maps — language values are the canonical English
  keys, not autonyms; queries are hand-assembled so commas stay literal). `proxy.ts` rewrites these to the internal dynamic `/live-sex/filter` route and
  301-upgrades the retired single-letter grammar (`?p=cb&g=f`) with attribution params
  preserved. Canonical for every filtered state is the bare hub.
- **Sitemaps**: `models-sitemap.xml` (chunked at 20 k URLs via `?page=N`, chunk list computed
  by the `sitemap.xml` index; `lastmod` = `lastSeenAt`, falling back to `updatedAt`) plus the hub/category entries in
  `live-sex-sitemap.xml`. Model pages are `index,follow` with self-canonicals; the filter
  route canonicals to the hub.
- `/out/model/<site>/<user>/` (full provider name) is the server-counted affiliate redirect (GA4 MP event
  `cam_click`), 302ing to the SAVED per-provider template — see **docs/cam-affiliate-links.md**
  for the templates, the verification drill, and the rule that every outbound link uses it.
  Unknown models 404 without firing an event. Robots-disallowed.

## Environment & secrets

| Variable | Where | Purpose |
|---|---|---|
| `CHATURBATE_WM`, `BONGACAMS_CAMPAIGN` | frontend env (server-only, never `NEXT_PUBLIC_`) | Affiliate feed credentials |
| `IMLIVE_API_KEY`, `IMLIVE_WID` | frontend env (server-only) | ImLive host-list API key + affiliate WID; key unset ⇒ ImLive disabled |
| `STRIPCASH_API_KEY`, `STRIPCASH_USER_ID` | frontend env (server-only) | Stripcash per-domain aggregators key + affiliate userId; key unset ⇒ StripChat disabled |
| `CAM_SYNC_SECRET` | **both** backend and frontend env | Guards `POST /api/cam-models/sync`; unset backend-side = route rejects everything; unset frontend-side = sync disabled with one warning log |
| `CAM_MODEL_RETENTION_DAYS` | backend env (optional) | Cleanup window override, default 60. A provider whose terms demand a stricter window sets `retentionDays` in the backend kernel (providers.json) and is swept on its own cutoff — StripChat is 30 days, per Stripcash's aggregator rules |

Dev defaults live in `docker-compose.yml` / `backend/.env`
(`local-dev-cam-sync-secret`). Staging/production get `CAM_SYNC_SECRET` from the
`deploy-staging.yml` "Write .env file" step — **the `CAM_SYNC_SECRET` repo secret must be
created in GitHub before the next deploy**, and `docker-compose.prod.yml` passes it to both
services.

## Deploying / transferring to staging & production

Order matters — backend first:

### Pre-deploy checklist (blockers first)

1. **Create the GitHub repo secret `CAM_SYNC_SECRET`** (any long random string) BEFORE deploying —
   without it the frontend sync is disabled and the backend rejects every post, so the model
   registry stays empty forever (no model pages, empty models-sitemap). It's wired into both
   services and the deploy workflow already; only the secret value is missing.
2. **BongaCams**: `BONGACAMS_CAMPAIGN` now defaults to `660500` in `docker-compose.prod.yml`
   (matching the baked `CHATURBATE_WM`), so the live BC grid works without extra wiring. To
   change the campaign later, promote it to a workflow secret.
3. **Run the content push** (`scripts/push-changed-content.mjs --apply`) — the code deploy ships
   SCHEMA only. Content that must ride: the BongaCams site + 3 offers + review, and the 35
   cam-categories (6 new tags + the language set with turkce/arabic already removed). Use
   `--apply --prune` ONLY if turkce/arabic-cams were pushed to staging in a prior run (deletions
   don't propagate on a plain apply); on a first-ever cam-categories push there's nothing to prune.
4. **Smoke-test Chaturbate playback from an off-VPS device** (e.g. phone on cellular) right after
   deploy: `hls_source` is resolved server-side and the token *might* be IP-bound or the VPS IP
   rate-limited. If so, CB video silently falls back to the static "Watch live" facade (degrades,
   never breaks) — but you want to know. If it fails, the rollback is flipping CB back to the
   provider iframe embed.

### Deploy order

1. **Backend deploy** (staging, then production): the `cam-model` content type auto-creates
   its tables on boot (no migration files); the crons register from `config/server.ts`; the
   raised `jsonLimit: '8mb'` ships with it (the default 1 MB would reject the ~1 MB roster).
   Public read permissions are granted automatically by the bootstrap loop.
2. **Repo secret**: create `CAM_SYNC_SECRET` (any long random string) before the frontend
   deploy; the workflow writes it into the server's `.env`.
3. **Frontend deploy**: on boot the first snapshot refresh syncs the current roster
   (~3–4 k creates, one-time); the registry then grows organically. Profile photos backfill
   at ≤300/hour, snapshots at ≤150/hour — expect galleries to fill over the first days.

**What transfers between environments and what never does:**

- `cam-models` rows and their photos are **environment-local machine data** and are
  regenerated from the feeds in each environment. Two independent guards in
  `scripts/push-changed-content.mjs` keep them out of the push: the **rows** are in
  `EXCLUDED_COLLECTIONS` (like `cam-favorites`), and the **photos** are dropped by the
  `isCamModelMedia` filter — cam media is named `${provider}:${username}-${ts}`, and that
  `provider:` colon prefix is filtered from both sides of the media diff (the global file diff
  is otherwise independent of which collections push, so without this filter every local dev
  capture — ~11 k files, ~170 MB — would upload and orphan itself, since the cam-model rows
  they attach to don't sync). Do **not** try to copy them; each environment discovers its own
  roster within minutes and backfills media within a day.
- What DOES ride the normal content push: **cam-categories** (genders/tags/sites/languages,
  their intro/FAQ copy, the `site` relation that powers the model-page offer card) and the
  Strapi **sites/offers** they link to.
- `cam-favorites` are per-user per-environment and never transfer (existing rule).

## Verifying an environment is healthy

```
# feeds + poller
docker compose logs frontend | grep "snapshot refreshed"     # every ~45s
# registry sync
docker compose logs frontend | grep "model sync"             # every ~5min after boot
curl -s $HOST/api/cam-model-keys | head -c 200                # rows exist (backend host)
# 404 gate + SEO
curl -so /dev/null -w '%{http_code}\n' $SITE/live-sex/chaturbate/nonexistent-user/   # 404
curl -s $SITE/models-sitemap.xml | grep -c '<loc>'
# media crons (profiles at :12, snapshots at :32)
docker compose logs backend | grep '\[cam-model\]'
```

Operator notes:

- The profiles/snapshots crons log **nothing on a zero-work run** — an empty `[cam-model]`
  grep on an idle registry is healthy, not broken. Cleanup always logs its "scanning" line.
- Backend `/cam-model-keys?page=N` past the data returns **200 with empty data** by design;
  only the frontend sitemap route converts that to a 404.
- Media cron runs can take 20+ minutes under CDN slowness — log completion timestamps won't
  sit neatly at :12/:32; the per-task overlap guards handle it.
- Run ONE frontend per environment: the 5-minute sync throttle is per-process, so a host dev
  server running next to the container doubles the write load against the same backend.
- After changing any env var, `docker compose restart` is NOT enough — recreate with
  `docker compose up -d <service>`, or the container keeps the old environment.
