import type { Core } from '@strapi/strapi';
import { cleanupExpired, ingestProfilePhotos, captureSnapshots, backfillActivity } from '../src/cron/cam-model-tasks';
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
  cron: {
    enabled: true,
    tasks,
  },
});

export default config;
