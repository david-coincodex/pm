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

Schedules, grace periods and descriptions live in **`backend/src/cron/checks.json`** — the one
manifest the cron table registers from and the provision script provisions from. This table
only explains what an alert MEANS:

| Check | What silence / `/fail` means |
|---|---|
| `<env>-cam-model-cleanup` | Silence: retention stopped — registry grows ~33k rows/day unbounded. `/fail`: persistent deletion failures (count in the body) or the ≥500 abort — poisoned rows are wedging deletion. |
| `<env>-cam-model-profiles` | Silence: the hourly run isn't happening. `/fail`: every attempt in a run failed — the ingest pipeline is dead (CDN change, blocked IP) even though the queue drains. |
| `<env>-cam-model-snapshots` | Silence: the hourly run isn't happening. `/fail`: every capture failed — dead thumb host or broken upload provider. |
| `<env>-cam-model-activity-backfill` | Silence: the tick isn't running (always a scheduler problem — done-state ticks still ping). `/fail`: usually lemoncams fetch errors. **Delete these checks when the one-shot cron is retired (#65).** |
| `<env>-cam-roster-sync` | The single most valuable check: one healthy ping proves the frontend snapshot poller, both provider feeds, the sync secret, the backend endpoint AND its write path at once. Pings arrive every ~5 min (frontend `SYNC_INTERVAL_MS`); the 10m period + 10m grace is deliberate margin — don't "tighten" it. `/fail` names provider feeds that have failed **continuously for 10 minutes** (`SUSTAINED_FAILURE_MS` in `lib/cams/registry.ts`) or a broken `lastSeenAt` bulk touch. It deliberately does NOT fire on a single failed poll: retention serves last-known models between polls, so one miss is invisible to visitors and self-heals within 45s — paging on it produced alerts that had already resolved before anyone read them (measured: all four feeds rejecting on one cycle from a transient network blip, every one covered by retention). A feed still down after 10 minutes is a rotated key, a changed endpoint or a blocked IP, and that still pages. Full silence = the sync chain itself is broken; check frontend logs (`[cams]`) first, then the backend sync route. Note: the frontend warms its poller at boot (`instrumentation.ts`), so an idle-but-healthy server still pings. |

Design notes:

- **Registered implies monitored**: cron tasks are wrapped by `withHeartbeat` at registration
  in `config/server.ts`, which owns the overlap guard, error containment, and both pings — a
  new cron added to the table is monitored by construction.
- The wrapper's overlap guard pings **nothing** when it skips a run — a stuck run means missed
  success pings means an alert. That is intended.
- A run that completes degraded reports it as `/fail` with the reason in the body: cleanup
  does this for ANY persistently-failing deletions (not just the ≥500 abort), because a stable
  poisoned set means retention has stalled for those rows.
- The roster sync pings `/fail` when the frontend reports degraded provider feeds, success
  otherwise; every other failure in the chain manifests as silence, which the check catches.
- Pings are fire-and-forget with a 10s timeout and never throw; non-2xx responses (e.g. a 404
  from an unprovisioned slug) are warned once per slug in the logs. A Healthchecks outage
  degrades to lateness alerts, never to broken jobs.
- **Cron errors are contained**: `withHeartbeat` catches task errors (with stack traces in the
  logs) instead of letting them escape — a cron failure must never take the serving API down.
  The flip side: once deployed, the ping key IS the failure signal. An environment without the
  key has silently-logging crons and no alerting — set the key before trusting the table above.

## Provisioning

Checks are created/updated by `scripts/provision-healthchecks.mjs` (Management API v3,
idempotent upsert by slug — safe to re-run):

```bash
node scripts/provision-healthchecks.mjs           # dry run + drift report
node scripts/provision-healthchecks.mjs --apply   # create/update all 10 checks
```

Both the cron table (`config/server.ts`) and this script read the SAME manifest —
`backend/src/cron/checks.json` — so schedules cannot drift between the scheduler and the
monitor. Re-run with `--apply` after any manifest change; the upsert also converges `desc`
and `channels`, so run it after adding a new integration too.

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

**Promote checklist** (until done, the `prod-*` checks sit unpinged in "new" state and never
alert — production is NOT monitored just because the checks exist):

1. `docker-compose.production.yml`: add `HEALTHCHECKS_PING_KEY: ${HEALTHCHECKS_PING_KEY:-}`
   and `HEALTHCHECKS_SLUG_PREFIX: prod` — **`prod`, not `staging`**: a copied compose that
   keeps `staging` makes production feed staging's checks (prod-* alerts forever on a healthy
   prod; staging-* stays green even with staging down).
2. `deploy-production.yml`: env + echo lines for `HEALTHCHECKS_PING_KEY` (mirror staging's).
3. `gh secret set HEALTHCHECKS_PING_KEY --env production`.
4. After the deploy, confirm the boot log line `[heartbeat] active — pinging "prod-*" checks`
   and that the five `prod-*` checks flip to "up".

## Responding to an alert

1. Open the check in Healthchecks — the event log shows the last pings and any `/fail` body
   (error text from the job).
2. `ssh` to the host → `docker logs <backend-container> | grep -E '\[cron\]|\[cam-model\]|\[cam-backfill\]|\[heartbeat\]'`.
3. A `[heartbeat] ... ping failed` warning in the logs with jobs otherwise healthy means the
   outage is between the host and Healthchecks, not in the job.
