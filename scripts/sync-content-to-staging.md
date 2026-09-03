# Copying content + media to staging

`scripts/sync-content-to-staging.mjs` pushes **content types and media only** from the local dev
Strapi to staging. Admin users, API tokens, transfer tokens, webhooks, and Strapi settings are never
touched.

```bash
node scripts/sync-content-to-staging.mjs                 # DRY RUN: preflight + divergence report
node scripts/sync-content-to-staging.mjs --verify-only   # just compare the two sides
node scripts/sync-content-to-staging.mjs --apply         # snapshot, sync, verify
node scripts/sync-content-to-staging.mjs --apply --only content   # skip the 385 MB media leg
```

Dry run is the default and touches nothing. It is worth running on its own just to answer "how far
has staging drifted?".

> **Status:** fully working. First production run 2026-08-06: snapshot pulled (19,406 records /
> 342 MB), then 3,343 entities + 5,797 assets (374 MB, 4.3 MB/s) pushed to staging in one
> transfer, all 13 collection counts reconciled and media spot-fetches passed. Rollback snapshots
> retained as `pmsnap-20260806-142122` (pre-sync state) and `pmsnap-20260806-130325`.

## Scope

Verified against the transfer's own manifest from that snapshot run — not assumed from the docs:

| Copied (`--only content,files`) | Never copied |
|---|---|
| all editorial collection types + components | admin users, admin roles (`config` scope) |
| media files (`plugin::upload.file` + folders) | API tokens, transfer tokens (`config` scope) |
| `plugin::i18n.locale` | webhooks, core-store settings (`config` scope) |
| **users-permissions users, roles, permissions** | **`cam-models`, `cam-favorites`** (env-local — see below) |
| `documentId`, numeric `id`, `publishedAt` preserved; draft **and** published versions | |

Two consequences of that last copied row, measured on real data:

- **Public-role permissions travel with the content.** A content type added locally arrives on
  staging with its permissions intact — no manual Settings → Roles step. (An earlier revision of
  this doc claimed the opposite; the manifest disproved it.)
- **End-user accounts travel too — and get replaced.** Staging currently has 1 users-permissions
  user that local (0 users) does not. A sync deletes it. If a staging end-user account ever
  matters, export it first.

## Cam data is never synced

`cam-models` (the registry: activity histories, `wentOnlineAt`, `firstSeenAt`, 100k+ rows) and
`cam-favorites` are **environment-local operational data**: every host regenerates the registry
from the provider feeds via the 5-minute roster sync and the crons, and favorites belong to that
host's own users. Syncing them would overwrite the destination's history with the source's — and
before this exclusion existed, a full `--apply` would have done exactly that.

Mechanically, both transfer legs (snapshot pull and push) run through
`scripts/strapi-transfer-nocam.cjs`, a wrapper that boots the stock `strapi transfer` CLI after
patching its ignored-content-type helpers in the require cache. That covers three surfaces at
once: the entity stream, the link stream, and — critically — the **destination's pre-restore
deletion** (the restore config is computed on the source side and sent over the wire, so the
patch protects staging without touching staging). The wrapper self-checks before every apply and
refuses to run an unfiltered transfer if a Strapi upgrade moves the internals it patches.

**Known caveat — cam photos.** Cam-model *rows* survive a full sync, but their media-library
photos are `plugin::upload.file` entries, which the media leg still replaces wholesale: after a
full sync the destination's cam photo files are gone and the surviving rows point at nothing.
The snapshot cron re-captures live models over time on its own. To force a full rebuild, clear
the capture markers on the destination DB and let the crons re-drain:

```sql
UPDATE cam_models SET photos_captured_at = NULL, profile_image_ingested_url = NULL;
```

(Without the `profile_image_ingested_url` reset, BongaCams profile portraits — ingested exactly
once per model — would never come back.)

`documentId` preservation matters: rich-text widgets embed it, and `/blog/<postId>/` URLs are
already indexed. Media URLs are stored root-relative and resolved at render, so nothing host-specific
travels with the content.

**One-directional and destructive.** Staging content for the transferred types is deleted before the
new data is written. It is not a merge. The dry run names, by slug, exactly what disappears.

## The three traps this script exists to handle

### 1. The local database is shadowed

`docker-compose.yml` mounts `strapi_tmp:/app/.tmp`, which hides the host file:

| | Size | Modified |
|---|---|---|
| container `/app/.tmp/data.db` | ~32 MB | current — **the real database** |
| host `backend/.tmp/data.db` | ~2 MB | weeks stale |

So every Strapi command must run through `docker compose exec`. A host-side `strapi export` ships
the stale database and reports success. Preflight asserts the container file's size and prints a
warning naming the host file when it is smaller.

```bash
docker compose exec -T backend stat -c %s /app/.tmp/data.db   # want >20 MB
```

### 2. Cloudflare Access blocks `strapi transfer`

`cms-staging.pornmode.com` sits behind a Cloudflare Access application. Access is satisfied by two
headers (`CF-Access-Client-Id` / `CF-Access-Client-Secret`), which is how the frontend talks to
staging — but **`strapi transfer` has no flag or env var for custom headers**, so it receives a 302
to a login page.

`cloudflared access tcp` does **not** solve this. It opens a WebSocket *to the origin*, and a plain
HTTP app behind Access does not speak that protocol. Measured against staging:

```
ERR failed to connect to origin error="websocket: bad handshake"
```

The fix is `scripts/lib/cf-access-proxy.mjs` — a local reverse proxy that injects the two headers and
passes the WebSocket upgrade through. The transfer protocol runs over a WebSocket, so upgrade
handling is essential; a request-only proxy authenticates the handshake and then stalls forever.

Verified working: `/_health` → 204, `/admin` → 200, and a raw upgrade to
`/admin/transfer/runner/push` reaches **Strapi** (401 for a missing token, rather than a CF redirect).

Standalone use, e.g. for manual commands:

```bash
node scripts/lib/cf-access-proxy.mjs --port 8443
# then --to http://host.docker.internal:8443/admin from inside a container
```

### 3. Reading drafts on staging needs a token

Staging's public role permits **published** reads, so counts work without credentials — but
`?status=draft` returns 401. Without `STAGING_STRAPI_TOKEN` the report degrades to published-only and
says so. A delta of 0 in that mode does not prove the sides match, because unpublished drafts on
staging are invisible.

## Minting a transfer token

Only needed once, and it cannot be done from here.

1. Open `https://cms-staging.pornmode.com/admin` (the CF Access service token or your own SSO login
   both work in a browser).
2. **Settings → Global settings → Transfer Tokens → Create new Transfer Token**.
3. Type **Full access**. This matters: the token is used in *both* directions — `--from` for the
   snapshot (a pull) and `--to` for the sync (a push). A Push-only token refuses the snapshot, and a
   Pull-only token refuses the sync, both with the same opaque `Authentication Error`.
4. Copy the token — it is shown only once — into `backend/.env` (which is gitignored; never the
   `.env.example`, which is committed):
   ```
   STAGING_TRANSFER_TOKEN=<long hex string>
   ```
5. Re-run the dry run.

### When it still says `Authentication Error`

The message is the same for every cause, so work through them in order:

- **Token type** — as above, it must permit the direction being used. Full access covers both.
- **Expiry** — the token list shows the expiry; an expired token gives the same error.
- **Salt rotation** — redeploying staging with a different `TRANSFER_TOKEN_SALT` silently invalidates
  every existing transfer token. Mint a fresh one after any change to that secret.
- **Truncated paste / stray whitespace** — the token is long; confirm the whole value landed.
- **Not the proxy** — verify with `CF_PROXY_DEBUG=1 node scripts/lib/cf-access-proxy.mjs`. A healthy
  upgrade logs `authorization=<len>` together with both `CF-Access-*` headers, which proves the
  credential reached Strapi intact and the failure is server-side.

## Runbook (works if the script is broken)

```bash
# 0. proxy, so strapi transfer can reach staging through Cloudflare Access
node scripts/lib/cf-access-proxy.mjs --port 8443 &

# 1. snapshot staging into a disposable local Strapi (see Snapshots below)
TS=$(date -u +%Y%m%d-%H%M%S)
docker compose -f docker-compose.backup.yml -p "pmsnap-$TS" run --rm scratch \
  /app/node_modules/.bin/strapi transfer \
    --from http://host.docker.internal:8443/admin --from-token "$STAGING_TRANSFER_TOKEN" \
    --only content,files --force

# 2. push content + media as ONE transfer (never split — see below)
docker compose exec -T backend /app/node_modules/.bin/strapi transfer \
  --to http://host.docker.internal:8443/admin --to-token "$STAGING_TRANSFER_TOKEN" \
  --only content,files --force

# 3. verify + bust the staging cache
node scripts/sync-content-to-staging.mjs --verify-only
```

`--force` is required when running non-interactively: without it the CLI prompts "data will be
deleted, continue?" and hangs.

### Why one transfer, never a content leg + files leg

Splitting looks attractive — the media is ~385 MB over a WebSocket with no resume, so "retry just
the media" sounds right. **It cannot work.** The destination resolves every incoming asset through
a source-id → destination-id map built from the `upload.file` entities restored **in the same
transfer session** (`resolveUploadFileId` in `@strapi/data-transfer`'s
`local-destination/assets-destination-writable`). A `--only files` push restores no entities, the
map is empty, and the very first asset fails with `File ID not found for ID: <n>` — measured, even
though a content-only push moments earlier had put all 1,706 file entities on staging.

Consequence: if a combined transfer dies mid-media, the retry is the full `content,files` transfer
again, not a media-only resume. The script rejects `--only files` outright.

## Snapshots and rollback

`pg_dump` would need shell access on the staging host, which this transport deliberately avoids.
Instead a snapshot pulls staging *into* a disposable local Strapi (`docker-compose.backup.yml`),
whose volumes become a restorable Strapi-format copy. Rollback is the same tool pointed the other
way.

The scratch service is isolated on purpose — its own `snapshot_db` and `snapshot_public` volumes,
never the dev `strapi_tmp` or the dev uploads bind mount, so a snapshot cannot overwrite local dev
content and 385 MB of media never lands in the working tree. It reuses the already-built
`pm-backend` image; each `-p pmsnap-<TS>` project namespaces only the volumes.

```bash
# list snapshots
docker volume ls | grep pmsnap

# roll staging back to a snapshot
docker compose -f docker-compose.backup.yml -p "pmsnap-<TS>" run --rm scratch \
  /app/node_modules/.bin/strapi transfer \
    --to http://host.docker.internal:8443/admin --to-token "$STAGING_TRANSFER_TOKEN" \
    --only content,files --force

# delete a snapshot you no longer need (removes that project's volumes)
docker compose -f docker-compose.backup.yml -p "pmsnap-<TS>" down -v
```

A failed or interrupted snapshot run leaves its volumes behind — the same `down -v` cleans them up.

Verifying what a snapshot actually holds (reads its SQLite directly):

```bash
docker compose -f docker-compose.backup.yml -p "pmsnap-<TS>" run --rm --entrypoint sh scratch -lc \
  'node -e "const D=require(\"better-sqlite3\")(\"/app/.tmp/data.db\",{readonly:true});
    for(const t of [\"sites\",\"articles\",\"files\",\"admin_users\"])
      console.log(t, D.prepare(\`SELECT COUNT(*) c FROM \${t}\`).get().c)"'
```

`admin_users` should always be **0** in a snapshot — that proves the `config` scope stayed out.

**Prove rollback before the first real sync**, on data you do not mind losing. Note a snapshot
restores content only — admin users and API tokens were never in it, and were never modified.

Staging Postgres is additionally backed up host-side by the infra repo's `backups.yml`
(proxmox-backup-client), which is a separate, lower-level safety net.

## Verification

Runs at the end of `--apply`, or standalone with `--verify-only`.

- **Row counts** for all 13 collections, from `meta.pagination.total`. Never count returned rows:
  `maxLimit: 100` in `backend/config/api.ts` silently clamps larger page sizes — the trap that once
  made the sitemap advertise 345 of ~750 pages.
- **Draft vs published** for the 7 draft&publish types. A transfer that arrived but lost publish
  state renders an empty site while every published-only check still passes.
- **Media**: `/api/upload/files` (returns a bare array and ignores pagination) plus on-disk
  `find /app/public/uploads -type f | wc -l` (~5798) and `du -sh` (~385 MB).
- **Spot-fetch** file URLs against `https://staging.pornmode.com/uploads/...` — that host serves
  media via the `promode-uploads` Traefik router, because the CMS host would 302 to a CF login.
- **Nothing collateral** changed: admin users, API tokens, webhooks.
- **Render check**: prices appear as `$<!-- -->9.99` in HTML because React inserts a text-node
  marker, so grep the number, not `$9.99`.

Afterwards, bust the frontend cache with `POST /api/revalidate`. If staging pages stay stale,
recreate the container — a plain `restart` keeps the `.next` cache.

## Gotchas

| Gotcha | Why it matters |
|---|---|
| users-permissions data IS content | permissions arrive with the sync (good — no manual role setup), but staging's end-user accounts are replaced by local's (see Scope) |
| Never mount a volume at `public/uploads` itself | Strapi renames `public/uploads` to a backup dir before writing, and a mount point cannot be renamed — the transfer dies instantly with `Local: backing up existing upload folder…`. Mount the parent `public/` (docker-compose.backup.yml does; so does docker-compose.staging.yml) |
| Schema must match | a mismatch fails the import *after* the destination is emptied; preflight fingerprints `src/api` + `src/components` on both sides |
| Watchtower | it auto-pulls `:latest` and can recreate `backend` mid-transfer |
| SQLite lock | do not use the local admin during a transfer; `docker compose run --rm` is the fallback |
| macOS bind-mount throughput | reading 385 MB of uploads through gRPC-FUSE takes minutes, not seconds |
| Unverified | whether `--only files` wipes existing uploads or merges them. The snapshot covers both; record the answer here after the first real run |

## Env

`backend/.env` — `STAGING_TRANSFER_URL`, `STAGING_TRANSFER_TOKEN`.
`scripts/.env` — `STRAPI_URL`, `STRAPI_TOKEN`, and optionally `STAGING_STRAPI_TOKEN` for a complete
(draft-inclusive) comparison.
`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` are read from `scripts/.env` or, failing that,
`frontend/.env.local`.

See `scripts/.env.example` and `backend/.env.example`.
