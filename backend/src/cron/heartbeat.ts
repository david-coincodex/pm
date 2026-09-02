/**
 * Dead-man's-switch heartbeats for the cron jobs and the roster sync (docs/monitoring.md).
 *
 * Every ping is a plain HTTP hit on hc-ping.com: success = "I ran fine", /fail = "I ran and
 * broke", silence = the alert. ALL notifications are sent by Healthchecks.io by comparing
 * ping arrival against each check's schedule + grace — no mail or alerting logic lives in
 * this codebase, deliberately: alerting must still work when this process is too broken to
 * send anything at all. Checks are provisioned with exact schedules by
 * scripts/provision-healthchecks.mjs (no ?create=1 here — auto-created checks with default
 * schedules would mask a provisioning gap).
 *
 * HEALTHCHECKS_PING_KEY unset → every ping is a no-op (crons still run); loud once in dev,
 * silent in production — a missing key is a setup step, not an incident worth logging on
 * every tick. HEALTHCHECKS_SLUG_PREFIX names the environment in the shared project
 * ("staging"/"prod", hardcoded per compose file; both run NODE_ENV=production so the prefix
 * is the only way to tell them apart).
 */

const BASE = 'https://hc-ping.com';
const KEY = process.env.HEALTHCHECKS_PING_KEY ?? '';
const PREFIX = process.env.HEALTHCHECKS_SLUG_PREFIX || 'dev';

let warnedNoKey = false;

/**
 * Fire-and-forget: never throws, never awaited — safe on latency-sensitive paths (the roster
 * sync) and in cron catch blocks alike. `detail` lands in the check's event log on /fail.
 */
export function pingHeartbeat(name: string, ok: boolean, detail?: string): void {
  if (!KEY) {
    if (!warnedNoKey && process.env.NODE_ENV !== 'production') {
      warnedNoKey = true;
      console.warn(`[heartbeat] HEALTHCHECKS_PING_KEY unset — "${PREFIX}-${name}" pings skipped. See docs/monitoring.md`);
    }
    return;
  }
  void fetch(`${BASE}/${KEY}/${PREFIX}-${name}${ok ? '' : '/fail'}`, {
    method: 'POST',
    body: detail ? detail.slice(0, 1000) : undefined,
    signal: AbortSignal.timeout(10_000),
  }).catch((err) => {
    // A dropped ping must never break the job it reports on. Healthchecks treats the missing
    // ping as lateness, which is the correct degraded behavior.
    console.warn(`[heartbeat] ${PREFIX}-${name} ping failed: ${err instanceof Error ? err.message : err}`);
  });
}
