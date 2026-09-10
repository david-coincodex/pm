/**
 * Hourly drip advancer — steps 2 and 3 of the newsletter onboarding sequence (the welcome,
 * step 1, is sent by the confirmation lifecycle in src/index.ts; the whole design is
 * documented in src/utils/drip.ts).
 *
 * HOURLY with a strict 48h gate, rather than a daily batch: a daily run would stretch
 * "after 2 days" into 2–3 days, and hourly lands each email at roughly the same time of day
 * the user signed up — an hour they were demonstrably awake and browsing.
 *
 * Registered mechanically from checks.json in config/server.ts, so it is heartbeat-monitored
 * (Healthchecks: ${HEALTHCHECKS_SLUG_PREFIX}-newsletter-drip) like every other cron: a run
 * with send failures or missing content reports ok:false, a wedged run stops pinging.
 * Single-instance assumption, same as the cam crons — withHeartbeat's overlap guard is
 * per-process.
 */

import type { Core } from '@strapi/strapi';
import type { TaskResult } from './heartbeat';
import { CRON_STEPS, DRIP_STEP_GAP_MS, fetchDripRunData, mailerConfigured, sendDripStep } from '../utils/drip';

const USER_UID = 'plugin::users-permissions.user';

/** Bounds one run; at hourly cadence the backlog drains fast, and a run stays short. */
const BATCH_LIMIT = 100;

export async function runNewsletterDrip({ strapi }: { strapi: Core.Strapi }): Promise<TaskResult> {
  if (!mailerConfigured()) return; // dev without secrets: nothing to send, ping success

  const cutoff = new Date(Date.now() - DRIP_STEP_GAP_MS).toISOString();
  const due: Array<{ id: number; email: string; dripStep: number }> = await strapi.db.query(USER_UID).findMany({
    where: {
      confirmed: true,
      blocked: { $ne: true },
      // NULL dripStep (accounts predating the drip) is excluded by $in on purpose: existing
      // users are not back-enrolled into an onboarding sequence they never started.
      dripStep: { $in: [...CRON_STEPS] },
      lastDripSentAt: { $lt: cutoff },
    },
    orderBy: { lastDripSentAt: 'asc' },
    limit: BATCH_LIMIT,
    select: ['id', 'email', 'dripStep'],
  });
  if (!due.length) return;

  // Live content is fetched ONCE per run, not per recipient — every user in the batch gets
  // the same "right now" facts, and the run does 2 content queries instead of 2×N.
  const data = await fetchDripRunData(strapi, {
    deals: due.some((u) => u.dripStep === 1),
    chaturbate: due.some((u) => u.dripStep === 2),
  });

  const counts = { sent: 0, skipped: 0, 'no-data': 0, failed: 0 };
  for (const user of due) {
    counts[await sendDripStep(strapi, user, user.dripStep, data)] += 1;
  }

  const detail = `due ${due.length}: sent ${counts.sent}, no-data ${counts['no-data']}, failed ${counts.failed}`;
  strapi.log.info(`[drip] ${detail}`);
  // no-data is a content problem (no active featured deals / no CB offer + sync down) and
  // failed is a send problem — both deserve the /fail ping so someone looks.
  return { ok: counts.failed === 0 && counts['no-data'] === 0, detail };
}
