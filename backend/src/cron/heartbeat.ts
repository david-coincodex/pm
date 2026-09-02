import type { Core } from '@strapi/strapi';

/**
 * Dead-man's-switch heartbeats for the cron jobs and the roster sync (docs/monitoring.md).
 *
 * Every ping is a plain HTTP hit on hc-ping.com: success = "I ran fine", /fail = "I ran and
 * broke", silence = the alert. ALL notifications are sent by Healthchecks.io by comparing
 * ping arrival against each check's schedule + grace — no mail or alerting logic lives in
 * this codebase, deliberately: alerting must still work when this process is too broken to
 * send anything at all. Checks are provisioned with exact schedules by
 * scripts/provision-healthchecks.mjs from the SAME manifest the cron table registers from
 * (./checks.json) — one source of truth, re-provision after changing it.
 *
 * HEALTHCHECKS_PING_KEY unset → every ping is a no-op (crons still run); loud once in dev,
 * silent in production — a missing key is a setup step, not an incident worth logging on
 * every tick. NOTE the flip side: cron errors are caught (a cron failure must never take the
 * serving API down with it), so once deployed the ping key IS the failure signal — an env
 * without it has silently-logging crons and nothing more.
 *
 * HEALTHCHECKS_SLUG_PREFIX names the environment in the shared project ("staging"/"prod",
 * hardcoded per compose file; both run NODE_ENV=production so the prefix is the only way to
 * tell them apart). The first ping logs the active prefix at info level — check it in the
 * boot logs after any deploy, especially a production promote (a copied compose file that
 * kept `staging` would feed the wrong checks).
 */

const BASE = 'https://hc-ping.com';

let warnedNoKey = false;
let loggedActive = false;
/** Slugs already warned about non-2xx responses — one line per slug, not one per tick. */
const warnedHttp = new Set<string>();

type Logger = Pick<Core.Strapi['log'], 'info' | 'warn'>;

/**
 * Fire-and-forget: never throws, never awaited — safe on latency-sensitive paths (the roster
 * sync) and inside catch blocks alike. `detail` lands in the check's event log.
 */
export function pingHeartbeat(log: Logger, name: string, ok: boolean, detail?: string): void {
  // Read per call, not at module load — keeps the helper indifferent to import order.
  const key = process.env.HEALTHCHECKS_PING_KEY ?? '';
  const prefix = process.env.HEALTHCHECKS_SLUG_PREFIX || 'dev';
  const slug = `${prefix}-${name}`;
  if (!key) {
    if (!warnedNoKey && process.env.NODE_ENV !== 'production') {
      warnedNoKey = true;
      log.warn(`[heartbeat] HEALTHCHECKS_PING_KEY unset — "${slug}" pings skipped. See docs/monitoring.md`);
    }
    return;
  }
  if (!loggedActive) {
    loggedActive = true;
    log.info(`[heartbeat] active — pinging "${prefix}-*" checks`);
  }
  void fetch(`${BASE}/${key}/${slug}${ok ? '' : '/fail'}`, {
    method: 'POST',
    body: detail ? detail.slice(0, 1000) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
    .then((res) => {
      // fetch resolves on 404/400 — an unprovisioned or renamed check would otherwise be a
      // fully silent monitoring hole. Latched per slug so a permanent 404 warns once, not
      // every tick; a later success re-arms the latch.
      if (!res.ok && !warnedHttp.has(slug)) {
        warnedHttp.add(slug);
        log.warn(`[heartbeat] ${slug} rejected: HTTP ${res.status} — check provisioning (scripts/provision-healthchecks.mjs)`);
      } else if (res.ok) {
        warnedHttp.delete(slug);
      }
    })
    .catch((err) => {
      // A dropped ping must never break the job it reports on. Healthchecks treats the
      // missing ping as lateness, which is the correct degraded behavior.
      log.warn(`[heartbeat] ${slug} ping failed: ${err instanceof Error ? err.message : err}`);
    });
}

/** A task's own verdict about a run that completed without throwing. */
export type TaskResult = { ok: boolean; detail?: string } | void;

const running = new Set<string>();

/**
 * Wrap a cron task so that REGISTERED implies MONITORED: the wrapper owns the overlap guard
 * (node-schedule fires on the clock, not on completion — a slow run must not overlap itself),
 * the catch (a cron error is logged with its stack and pinged as /fail, never allowed to
 * escape into the process), and the success ping. Tasks return a TaskResult to report a
 * completed-but-degraded run (e.g. cleanup with persistent deletion failures) as /fail.
 *
 * An overlap-skipped tick pings NOTHING on purpose: a stuck run means missed success pings
 * means an alert — which is the point.
 */
export function withHeartbeat(
  name: string,
  task: (ctx: { strapi: Core.Strapi }) => Promise<TaskResult>,
): (ctx: { strapi: Core.Strapi }) => Promise<void> {
  return async ({ strapi }) => {
    if (running.has(name)) return;
    running.add(name);
    try {
      const result = await task({ strapi });
      if (result) pingHeartbeat(strapi.log, name, result.ok, result.detail);
      else pingHeartbeat(strapi.log, name, true);
    } catch (err) {
      strapi.log.error(`[cam-model] ${name} run failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      pingHeartbeat(strapi.log, name, false, err instanceof Error ? err.message : String(err));
    } finally {
      running.delete(name);
    }
  };
}
