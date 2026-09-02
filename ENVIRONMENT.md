# Environment variables — what's required and where

Every env var the code actually reads, grouped by **where you set it**. Legend:
**R** = required, **O** = optional (has a default), **🔒** = secret (never commit / never `NEXT_PUBLIC_`),
**🏗️** = baked into the frontend bundle at **build** time (not runtime).

> ⚠️ **Frontend build caveat:** `NEXT_PUBLIC_*` values are compiled into the browser bundle when
> the image is **built**, not read at runtime. Production images MUST be built with the
> production values (esp. `NEXT_PUBLIC_STRAPI_URL=https://cms.pornmode.com`). The in-repo
> `deploy-staging.yml` bakes the **staging** values — do not ship those images to production.

---

## 1. Production / staging host — Backend (Strapi) service env

Set on the host (its `docker-compose.yml` / `.env`). The `db` service derives `POSTGRES_*` from
the `DATABASE_*` values.

| Var | R/O | Secret | Purpose |
|---|---|---|---|
| `APP_KEYS` | R | 🔒 | Strapi app keys (comma-separated, ≥2 `openssl rand -base64 32`) |
| `API_TOKEN_SALT` | R | 🔒 | `openssl rand -base64 32` |
| `ADMIN_JWT_SECRET` | R | 🔒 | `openssl rand -base64 32` |
| `TRANSFER_TOKEN_SALT` | R | 🔒 | `openssl rand -base64 32` |
| `JWT_SECRET` | R | 🔒 | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | R | 🔒 | `openssl rand -base64 32` (Strapi 5) |
| `DATABASE_PASSWORD` | R | 🔒 | Postgres password |
| `DATABASE_CLIENT` | R | | `postgres` |
| `DATABASE_HOST` | R | | `db` (compose service name) |
| `DATABASE_PORT` | R | | `5432` |
| `DATABASE_NAME` | O | | default `promode` |
| `DATABASE_USERNAME` | O | | default `postgres` |
| `DATABASE_SSL` | O | | `false` on the internal network |
| `FRONTEND_URL` | R | | CORS origin — the public site (`https://pornmode.com`) |
| `HOST` / `PORT` | R | | `0.0.0.0` / `1339` |
| `NODE_ENV` | R | | `production` |
| **`CAM_SYNC_SECRET`** | **R** | 🔒 | **Guards `POST /api/cam-models/sync`. Unset ⇒ backend rejects every sync ⇒ registry stays empty (no model pages, empty models-sitemap). MUST match the frontend's value.** |
| `CAM_MODEL_RETENTION_DAYS` | O | | default `60` — models unseen this long are deleted (page 404s, drops from sitemap) |
| `HEALTHCHECKS_PING_KEY` | O | 🔒 | Healthchecks.io project ping key for cron/sync heartbeats (docs/monitoring.md). Unset ⇒ pings skipped, crons still run — but no alerting. |
| `HEALTHCHECKS_SLUG_PREFIX` | O | | `staging`/`prod` — names this env's check slugs; hardcoded in each compose file, defaults to `dev` |
| `DATABASE_URL`, `DATABASE_SCHEMA`, `DATABASE_POOL_MIN/MAX`, `DATABASE_CONNECTION_TIMEOUT`, `DATABASE_SSL_*`, `DATABASE_FILENAME` | O | | Advanced DB knobs — leave unset for the standard Postgres setup |
| `FLAG_NPS`, `FLAG_PROMOTE_EE` | O | | Strapi feature flags — unused here |

---

## 2. Production / staging host — Frontend (Next.js) service env

| Var | R/O | Notes |
|---|---|---|
| `NEXT_PUBLIC_STRAPI_URL` | R | 🏗️ **Build arg.** Browser's Strapi origin. **Prod: `https://cms.pornmode.com`.** Staging: `https://cms-staging.pornmode.com`. |
| `NEXT_PUBLIC_MEDIA_BASE` | O | 🏗️ Build arg. Staging sets `https://staging.pornmode.com` (media same-origin behind CF Access). **Omit for prod** — serve media straight from the CMS host. |
| `NEXT_PUBLIC_GA_ID` | O | 🏗️ GA4 measurement ID (public) for client analytics. |
| `STRAPI_INTERNAL_URL` | R | Server-side Strapi URL over the Docker network: `http://backend:1339`. |
| `REVALIDATE_SECRET` | O | 🔒 Shared secret for the Strapi publish webhook → `/api/revalidate`. Set it if you want publishes to purge the cache instantly. |
| `GA_API_SECRET` | O | 🔒 GA4 Measurement Protocol secret for **server-side** offer/cam-click events (this audience blocks gtag). Server-only — never `NEXT_PUBLIC_`. |
| `CHATURBATE_WM` | O | 🔒 Chaturbate affiliate WM. Default `y98oG` (baked in `docker-compose.prod.yml`). |
| `BONGACAMS_CAMPAIGN` | O | 🔒 BongaCams campaign id. Default `660500`. Unset ⇒ BongaCams disabled (Chaturbate-only). |
| **`CAM_SYNC_SECRET`** | **R** | 🔒 **Same value as the backend.** Unset frontend-side ⇒ the registry sync is disabled (one warning log), registry never fills. |
| `NODE_ENV` / `PORT` / `HOSTNAME` | R | `production` / `3002` / `0.0.0.0`. |

---

## 3. GitHub Actions — **Settings → Environments** (both deploys)

Each deploy workflow's "Write .env file" step writes these into the host `.env`. **Staging** runs
`deploy-staging.yml` (`environment: staging`, on push to `staging`); **production** runs
`deploy-production.yml` (`environment: production`, on push to `production`). Production resolves
from the `production` environment first, falling back to repo-level secrets shared with staging —
so set at minimum `SSH_PRIVATE_KEY`, `DATABASE_PASSWORD`, the Strapi key/salt set, **and
`CAM_SYNC_SECRET`** under **Settings → Environments → `production`** so the two hosts don't share
credentials.

**Secrets:** `SSH_PRIVATE_KEY`, `APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`,
`TRANSFER_TOKEN_SALT`, `JWT_SECRET`, `ENCRYPTION_KEY`, `DATABASE_PASSWORD`, `CAM_SYNC_SECRET`,
`REVALIDATE_SECRET`, `GA_API_SECRET`, `HEALTHCHECKS_PING_KEY`.
**Variables:** `DEPLOY_USER`, `DATABASE_NAME`, `DATABASE_USERNAME`, plus `DEPLOY_HOST` (staging)
/ `DEPLOY_HOST_PROD` (production).

> ⚠️ If you add a NEW env var the cam feature (or anything) needs, it must be added in **three
> places per environment**: the compose file (`docker-compose.prod.yml` / `docker-compose.production.yml`),
> the workflow's "Write .env file" step, and the GitHub environment secret/var. Missing any one
> silently leaves it empty on that host — this is exactly what stranded `CAM_SYNC_SECRET` on
> production at launch.

---

## 4. Local dev machine — `scripts/.env` (content push + tooling)

Only needed to run `scripts/*` (content sync, description generation). Never deployed.

| Var | For |
|---|---|
| `STRAPI_URL` / `STRAPI_TOKEN` | Local Strapi (source of a content push). |
| `STAGING_STRAPI_TOKEN` | Staging Strapi REST token (push `--to staging`). |
| `STAGING_TRANSFER_TOKEN` / `STAGING_TRANSFER_URL` | `strapi transfer` full-replace path (optional; host defaults to `cms-staging.pornmode.com`). |
| `PRODUCTION_STRAPI_TOKEN` | Production Strapi REST token (push `--to production`). |
| `PRODUCTION_CMS_URL` | default `https://cms.pornmode.com`. |
| `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access service token — required to reach the CF-gated **staging** CMS (and the parity check). |
| `PRODUCTION_CF_ACCESS_CLIENT_ID` / `_SECRET` | Prod CF Access token if prod CMS is gated (falls back to the shared pair). |
| `OPENAI_API_KEY` (+ `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS`, `OPENAI_PRICE_GPT`) | Description-generation scripts. |
| `STRAPI_ADMIN_EMAIL` / `STRAPI_ADMIN_PASSWORD` | Scripts that log into the admin API. |
| `BRAZZERS_SITE_SLUG`, `DRY_RUN`, `CF_PROXY_DEBUG`, `GA_MP_DEBUG` | Per-script toggles. |

---

## Cam feature — the ones that actually matter for `/live-sex/`

If the live-cam section misbehaves, it's almost always one of these:

| Var | Where | Symptom if wrong/unset |
|---|---|---|
| **`CAM_SYNC_SECRET`** | backend **and** frontend, same value | Registry never fills → no model pages, empty models-sitemap. |
| `NEXT_PUBLIC_STRAPI_URL` | frontend **build** | Wrong value ⇒ every browser call 404s against the wrong (gated) CMS. |
| `CHATURBATE_WM` / `BONGACAMS_CAMPAIGN` | frontend runtime | Wrong ⇒ affiliate clicks credited to the wrong account / provider disabled. |
| `GA_API_SECRET` | frontend runtime | Unset ⇒ cam/offer clicks aren't counted server-side. |
| `REVALIDATE_SECRET` | frontend runtime + Strapi webhook | Unset ⇒ CMS edits wait for the ISR window instead of purging instantly. |
