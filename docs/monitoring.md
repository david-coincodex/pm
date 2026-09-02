# Heartbeat monitoring (Healthchecks.io)

Every backend cron job and the roster sync send a **dead-man's-switch heartbeat** to
Healthchecks.io: a plain HTTP ping on success, `/fail` + the error text on failure. The
service alerts when pings **stop arriving** against each check's schedule + grace — which is
what catches the worst failure mode, "the job silently stopped running" (hung run, dead
scheduler, changed third-party API, broken sync chain, container down).

**All notifications are sent by Healthchecks, never by us.** There is no mail or alerting
code in this repo — deliberately, so alerting still works when our stack is too broken to
send anything. Alert channels are configured in Healthchecks → Integrations (email today);
every check attaches to all project integrations.

## The checks

One Healthchecks project serves every environment; slugs are `<env>-<name>` with env prefixes
`staging` and `prod` (`HEALTHCHECKS_SLUG_PREFIX`, hardcoded per compose file). Ping sender:
`backend/src/cron/heartbeat.ts`.

| Check | Schedule (UTC) | Grace | What silence means |
|---|---|---|---|
| `<env>-cam-model-cleanup` | cron `0 4 * * *` | 6h | Retention stopped — registry grows ~33k rows/day unbounded. A `/fail` with "aborted after N failures" means poisoned rows are wedging deletion. |
| `<env>-cam-model-profiles` | cron `12 * * * *` | 2h | BongaCams portrait ingestion stalled (new models get no profile photo). |
| `<env>-cam-model-snapshots` | cron `32 * * * *` | 2h | Live snapshot capture stalled (model pages stop collecting photos). |
| `<env>-cam-model-activity-backfill` | cron `*/10 * * * *` | 30m | The backfill tick isn't running. Done-state ticks still ping, so silence always means "scheduler problem", never "backfill finished". A `/fail` usually carries lemoncams fetch errors. **Delete these checks when the one-shot cron is retired (#65).** |
| `<env>-cam-roster-sync` | every ~10 min (simple) | 10m | The single most valuable check: one success ping proves the frontend snapshot poller, both provider feeds, the sync secret, and the backend endpoint at once. Silence = models stopped flowing; check frontend logs (`[cams]`) first, then the backend sync route. |

Design notes:

- The cron tasks' overlap guards ping **nothing** when they skip a run — a stuck run means
  missed success pings means an alert. That is intended.
- A run that finishes abnormally without throwing (cleanup's abort-after-500-failures) pings
  `/fail` explicitly, with the reason in the body.
- The roster sync pings success only; its failures are structural (secret, feeds, poller) and
  manifest as silence, which the check is built to catch.
- Pings are fire-and-forget with a 10s timeout and never throw — a Healthchecks outage
  degrades to lateness alerts, never to broken jobs.

## Provisioning

Checks are created/updated by `scripts/provision-healthchecks.mjs` (Management API v3,
idempotent upsert by slug — safe to re-run):

```bash
node scripts/provision-healthchecks.mjs           # dry run + drift report
node scripts/provision-healthchecks.mjs --apply   # create/update all 10 checks
```

Re-run with `--apply` **whenever a cron rule in `backend/config/server.ts` changes** — the
schedules there and in the script must mirror each other, or Healthchecks alerts on a
perfectly healthy job (or worse, tolerates a broken one).

## Environment variables

| Var | Where | Purpose |
|---|---|---|
| `HEALTHCHECKS_PING_KEY` | backend runtime (secret) | Project ping key. Empty ⇒ pings skipped, crons unaffected. |
| `HEALTHCHECKS_SLUG_PREFIX` | backend runtime (not secret) | `staging` / `prod`, hardcoded in each compose file; defaults to `dev`. |
| `HEALTHCHECKS_API_KEY` | `scripts/.env` only | Read-write project API key for the provisioning script. Never deployed. |

The ping key follows the three-places rule (ENVIRONMENT.md): compose file + workflow `.env`
writer + GitHub environment secret. Staging is wired; **production wiring happens on the
`production` branch at promote time** (`docker-compose.production.yml` + `deploy-production.yml`
+ the `production` GitHub environment secret), since those files exist only there.

## Responding to an alert

1. Open the check in Healthchecks — the event log shows the last pings and any `/fail` body
   (error text from the job).
2. `ssh` to the host → `docker logs <backend-container> | grep -E '\[cam-model\]|\[cam-backfill\]|\[heartbeat\]'`.
3. A `[heartbeat] ... ping failed` warning in the logs with jobs otherwise healthy means the
   outage is between the host and Healthchecks, not in the job.
