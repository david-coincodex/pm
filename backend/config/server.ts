import type { Core } from '@strapi/strapi';
import { cleanupExpired, ingestProfilePhotos, captureSnapshots, backfillActivity } from '../src/cron/cam-model-tasks';

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
      'cam-model-cleanup': { task: cleanupExpired, options: { rule: '0 4 * * *' } },
      // Ingest BongaCams profile photos into the media library (recently-seen models only).
      'cam-model-profiles': { task: ingestProfilePhotos, options: { rule: '12 * * * *' } },
      // Capture live snapshots (first-timers + longest-uncaptured refresh share).
      'cam-model-snapshots': { task: captureSnapshots, options: { rule: '32 * * * *' } },
      // One-shot heatmap-history import from lemoncams; marks itself done in the core store.
      'cam-model-activity-backfill': { task: backfillActivity, options: { rule: '*/10 * * * *' } },
    },
  },
});

export default config;
