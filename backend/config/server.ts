import type { Core } from '@strapi/strapi';
import { cleanupExpired, ingestProfilePhotos, captureSnapshots, backfillActivity } from '../src/cron/cam-model-tasks';
import { withHeartbeat } from '../src/cron/heartbeat';
import checks from '../src/cron/checks.json';

/**
 * Cron registration. Schedules come from src/cron/checks.json — the SAME manifest
 * scripts/provision-healthchecks.mjs provisions the Healthchecks checks from, so the monitor
 * and the scheduler can never drift apart. After changing the manifest, re-run the provision
 * script (docs/monitoring.md). withHeartbeat makes REGISTERED imply MONITORED: overlap guard,
 * error containment, and the success//fail pings all attach here, not in the task bodies.
 */
const cron = (name: keyof typeof checks, task: Parameters<typeof withHeartbeat>[1]) => ({
  task: withHeartbeat(name, task),
  options: { rule: (checks[name] as { schedule: string }).schedule },
});

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  cron: {
    enabled: true,
    tasks: {
      // Delete cam models unseen for 60 days (their pages then 404 and leave the sitemap).
      'cam-model-cleanup': cron('cam-model-cleanup', cleanupExpired),
      // Ingest BongaCams profile photos into the media library (recently-seen models only).
      'cam-model-profiles': cron('cam-model-profiles', ingestProfilePhotos),
      // Capture live snapshots (first-timers + longest-uncaptured refresh share).
      'cam-model-snapshots': cron('cam-model-snapshots', captureSnapshots),
      // One-shot heatmap-history import from lemoncams; marks itself done in the core store.
      'cam-model-activity-backfill': cron('cam-model-activity-backfill', backfillActivity),
    },
  },
});

export default config;
