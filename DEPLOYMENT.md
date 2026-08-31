# Deployment — Staging

Staging deploys are fully automated. Push to the **`staging`** branch (or run the
**Deploy — Staging** workflow manually) and GitHub Actions builds two container
images, pushes them to GHCR, and rolls them out on the `promode-staging` host.

## What runs where

| Component | Image | Public URL | Container port |
|---|---|---|---|
| Frontend (Next.js standalone) | `ghcr.io/david-coincodex/pm-frontend` | `https://staging.pornmode.com` | 3002 |
| Backend (Strapi 5) | `ghcr.io/david-coincodex/pm-backend` | `https://cms-staging.pornmode.com` (admin at `/admin`, REST at `/api`) | 1339 |
| Postgres 16 | `postgres:16-alpine` | internal only | 5432 |

- Routing is done by the host's **Traefik** (`traefik_public` network, `:80`).
- The browser talks to Strapi at `cms-staging.pornmode.com` — baked into the
  client bundle via the `NEXT_PUBLIC_STRAPI_URL` **build arg** (see the workflow).
  Next.js server components use `STRAPI_INTERNAL_URL=http://backend:1339` over the
  internal Docker network instead.
- Strapi CORS allows the frontend origin via `FRONTEND_URL` (`config/middlewares.ts`).
- **Media** is stored relative (`/uploads/...`) and resolved at render. Staging sets the
  `NEXT_PUBLIC_MEDIA_BASE` build arg to `https://staging.pornmode.com`, served by the
  `promode-uploads` Traefik router (priority 100) so media is same-origin with the site. Omit the
  variable to serve media straight from the CMS host instead — correct for production, where the
  CMS is not behind Cloudflare Access. Verify with `node scripts/normalize-media-urls.mjs --check`.

## Flow

1. Push to `staging` → `.github/workflows/deploy-staging.yml` runs.
2. **build-and-push**: builds `frontend` + `backend` (`target: production`), tags
   `:latest` and `:<sha>`, pushes to GHCR.
3. **deploy**: SSHes to the host as the `deploy` user, rsyncs `docker-compose.prod.yml`
   → `/opt/promode/docker-compose.yml` and a generated `.env`, then
   `docker compose pull && docker compose up -d --remove-orphans`.
4. Watchtower on the host also auto-pulls new `:latest` images on its schedule.

## Required GitHub configuration

Set these under **Settings → Environments → `staging`**.

### Secrets
| Secret | What |
|---|---|
| `SSH_PRIVATE_KEY` | Private half of the host's `deploy` key (`/home/deploy/.ssh/github_actions` on `promode-staging`) |
| `APP_KEYS` | Strapi app keys (comma-separated, e.g. two `openssl rand -base64 32` values) |
| `API_TOKEN_SALT` | `openssl rand -base64 32` |
| `ADMIN_JWT_SECRET` | `openssl rand -base64 32` |
| `TRANSFER_TOKEN_SALT` | `openssl rand -base64 32` |
| `JWT_SECRET` | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` (required by Strapi 5 — `config/admin.ts`) |
| `DATABASE_PASSWORD` | Postgres password for the `db` container |

### Variables
| Variable | Example |
|---|---|
| `DEPLOY_HOST` | `167.233.101.88` (host's public IP, reachable from GitHub runners on :22) |
| `DEPLOY_USER` | `deploy` |
| `DATABASE_NAME` | `promode` |
| `DATABASE_USERNAME` | `postgres` |

## Host prerequisites (already provisioned)

- Docker + Compose, Traefik on `:80`, the external `traefik_public` network.
- A `deploy` user in the `docker` group with the matching public key in
  `~/.ssh/authorized_keys`.
- Postgres backups are handled host-side by the infra repo's `backups.yml`
  (proxmox-backup-client), so the `db` container is picked up automatically.

> **GHCR visibility:** Watchtower pulls `:latest` as root and won't have the
> `deploy` user's GHCR login. Either make the `pm-frontend`/`pm-backend` packages
> public, or add registry credentials for watchtower on the host.

## Copying content to staging

Deploys ship **code**, never content. To push content types and media from local dev
to staging, see [`scripts/sync-content-to-staging.md`](scripts/sync-content-to-staging.md):

```bash
node scripts/sync-content-to-staging.mjs        # dry run: how far has staging drifted?
```

It copies content + media only — admin users, API tokens, webhooks and Strapi settings
are never touched — and it snapshots staging first, because the transfer replaces rather
than merges. Those snapshots are content-level and separate from the infra repo's
proxmox Postgres backups above; the two cover different failure modes.

Note that `strapi transfer` cannot reach `cms-staging.pornmode.com` directly: it is behind
Cloudflare Access and the CLI has no way to send service-token headers. The script proxies
through `scripts/lib/cf-access-proxy.mjs`.

## Production

Production is `pornmode.com` (frontend) + `cms.pornmode.com` (Strapi). It deploys off the
**`production`** branch. **This repo has no production workflow** — `.github/workflows/` only
has `deploy-staging.yml`. The production branch is rolled out by **external infra** (watches the
branch / Watchtower); confirm the exact mechanism with the infra setup before relying on timing.

### Launch / release flow

1. **Ship code:** open a PR `staging → production` and merge it (production is protected — never
   push it directly). Example: `gh pr create --base production --head staging …` then
   `gh pr merge <n> --merge`. This carries whatever is on staging — check first with
   `git log origin/production..origin/staging --oneline`.
2. **Wait for the backend to redeploy.** There's no in-repo run to watch, so poll the CMS for the
   new schema — it must exist before the content sync:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' \
     "https://cms.pornmode.com/api/cam-categories?pagination%5BpageSize%5D=1" \
     -H "Authorization: Bearer $PRODUCTION_STRAPI_TOKEN"     # 404 = not yet, 200 = ready
   ```
   The `cam-model`/`cam-category` tables and the 3 maintenance crons auto-create on backend boot
   (no migration files).
3. **Sync content to production** — deploys ship code, never content:
   ```bash
   node scripts/push-changed-content.mjs --to production        # dry run
   node scripts/push-changed-content.mjs --to production --apply # confirmation word: PUSH PRODUCTION
   ```
   Gated by **STAGING PARITY**: it refuses unless local ≡ staging for every collection, so prod
   only ever receives staging-approved content. Needs `PRODUCTION_STRAPI_TOKEN` +
   `CF_ACCESS_CLIENT_ID/SECRET` in `scripts/.env`. This carries the cam-categories + BongaCams
   site/offers/review; `isCamModelMedia` keeps the ~11k cam captures out (they regenerate per-env).
4. **Registry rebuilds itself.** `cam-models` + `cam-favorites` are in `EXCLUDED_COLLECTIONS` and
   never transfer — production discovers its own roster from the feeds within minutes, backfills
   media over a day. Model pages fail OPEN on a CMS blip (render, never mass-404).

### Prod env prerequisites (on the prod host / its compose)

`CAM_SYNC_SECRET` (both services, or the registry stays empty — no model pages, empty
models-sitemap), `CHATURBATE_WM` + `BONGACAMS_CAMPAIGN` (defaults baked in
`docker-compose.prod.yml`), the standard Strapi secrets + DB. **Frontend image caveat:** the
browser bundle bakes `NEXT_PUBLIC_STRAPI_URL` at BUILD — production images MUST be built with
`https://cms.pornmode.com`, NOT the `cms-staging` value the in-repo `deploy-staging.yml` uses.
Verify a prod frontend build points at the prod CMS, or every client call 404s against gated
staging.
