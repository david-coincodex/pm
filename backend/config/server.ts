import type { Core } from '@strapi/strapi';
import { cleanupExpired, ingestProfilePhotos, captureSnapshots, backfillActivity } from '../src/cron/cam-model-tasks';
import { runNewsletterDrip } from '../src/cron/newsletter-drip';
import { withHeartbeat, type TaskResult } from '../src/cron/heartbeat';
import checks from '../src/cron/checks.json';

/**
 * Cron registration is MECHANICAL over the manifest (src/cron/checks.json) — the same file
 * scripts/provision-healthchecks.mjs provisions the Healthchecks checks from, so scheduler
 * and monitor cannot drift. Every `crons` manifest entry MUST have a task here and vice
 * versa: a missing mapping throws at config load (boot failure beats a provisioned check
 * that is never pinged — those sit in "new" state and never alert). withHeartbeat makes
 * REGISTERED imply MONITORED: overlap guard, error containment, and success//fail pings all
 * attach here, not in the task bodies. After changing the manifest, re-run the provision
 * script (docs/monitoring.md).
 */
const TASKS: Record<keyof typeof checks.crons, (ctx: { strapi: Core.Strapi }) => Promise<TaskResult>> = {
  // Delete cam models unseen for 60 days (their pages then 404 and leave the sitemap).
  'cam-model-cleanup': cleanupExpired,
  // Ingest BongaCams profile photos into the media library (recently-seen models only).
  'cam-model-profiles': ingestProfilePhotos,
  // Capture live snapshots (first-timers + longest-uncaptured refresh share).
  'cam-model-snapshots': captureSnapshots,
  // One-shot heatmap-history import from lemoncams; marks itself done in the core store.
  'cam-model-activity-backfill': backfillActivity,
  // Advance newsletter subscribers through onboarding-drip steps 2-3 (48h apart).
  'newsletter-drip': runNewsletterDrip,
};

const tasks = Object.fromEntries(
  Object.entries(checks.crons).map(([name, cfg]) => {
    const task = TASKS[name as keyof typeof checks.crons];
    if (!task) throw new Error(`checks.json cron "${name}" has no task mapped in config/server.ts`);
    return [name, { task: withHeartbeat(name, task), options: { rule: cfg.schedule } }];
  }),
);

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  /**
   * PUBLIC origin of this CMS. Strapi derives `server.absoluteUrl` from it, and the Google
   * provider builds its OAuth redirect_uri as `<absoluteUrl>/api/connect/google/callback` —
   * without this it would use the container's host:port, which Google can never reach and
   * which would not match the URI registered in the Google console.
   */
  url: env('STRAPI_PUBLIC_URL', 'http://localhost:1339'),
  /**
   * Trust X-Forwarded-* — REQUIRED for auth rate limiting to work at all. The
   * users-permissions rate limiter keys its buckets on path + `ctx.request.ip`, and every
   * auth request reaches Strapi from the frontend container (the BFF), so without this the
   * whole site shares ONE 5-per-5-minutes bucket: five failed logins lock out every visitor,
   * and an attacker can trigger that deliberately. With `proxy` on, koa reads the client IP
   * from the X-Forwarded-For the BFF forwards, giving per-visitor buckets. Safe here because
   * the CMS is not directly reachable — Traefik fronts it in every deployed environment.
   *
   * NOTE the shape: Strapi 5 reads this as `server.proxy.koa`
   * (@strapi/core/dist/services/server/index.js) — a bare `proxy: true` is silently ignored,
   * and the sibling `proxy.http/https/global` keys are about OUTBOUND requests, not this.
   */
  proxy: { koa: true },
  cron: {
    enabled: true,
    tasks,
  },
});

export default config;
