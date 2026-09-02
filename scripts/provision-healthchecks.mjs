#!/usr/bin/env node
/**
 * provision-healthchecks.mjs — create/update the Healthchecks.io checks that receive the
 * backend's heartbeat pings (backend/src/cron/heartbeat.ts, docs/monitoring.md).
 *
 * One Healthchecks project serves every environment; slugs carry the env prefix
 * (staging-cam-model-cleanup, prod-cam-model-cleanup, …). Schedules and grace periods below
 * MUST mirror backend/config/server.ts's cron rules — re-run this script whenever a rule
 * changes. Idempotent: upserts by slug (`unique: ["slug"]`), so re-running converges instead
 * of duplicating.
 *
 * Alerting itself is configured in Healthchecks (Integrations); every check is attached to
 * all of the project's integrations (`channels: "*"`). Our code never sends notifications.
 *
 * Usage:
 *   node provision-healthchecks.mjs            # dry run: show what would be created/updated
 *   node provision-healthchecks.mjs --apply    # write
 *
 * Env (scripts/.env): HEALTHCHECKS_API_KEY — a READ-WRITE project API key
 * (Healthchecks → Project Settings → API Access). The ping key is NOT needed here.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
_require('dotenv').config({ path: join(__dirname, '.env'), quiet: true });

const API = 'https://healthchecks.io/api/v3';
const API_KEY = process.env.HEALTHCHECKS_API_KEY;
const APPLY = process.argv.includes('--apply');

if (!API_KEY) {
  console.error('HEALTHCHECKS_API_KEY missing from scripts/.env (needs a read-write project API key).');
  process.exit(1);
}

const PREFIXES = ['staging', 'prod'];

/**
 * The five checks per environment. Cron schedules mirror backend/config/server.ts; the
 * roster sync is a simple-period check (it rides snapshot refreshes, not a cron rule).
 * Container tz is UTC (verified against cron log timestamps).
 */
const CHECKS = [
  {
    name: 'cam-model-cleanup',
    schedule: '0 4 * * *',
    grace: 6 * 3600,
    desc: 'Daily registry retention (cam-model-tasks.ts cleanupExpired). /fail carries the abort reason.',
  },
  {
    name: 'cam-model-profiles',
    schedule: '12 * * * *',
    grace: 2 * 3600,
    desc: 'Hourly BongaCams profile photo ingest (ingestProfilePhotos).',
  },
  {
    name: 'cam-model-snapshots',
    schedule: '32 * * * *',
    grace: 2 * 3600,
    desc: 'Hourly live snapshot capture (captureSnapshots).',
  },
  {
    name: 'cam-model-activity-backfill',
    schedule: '*/10 * * * *',
    grace: 30 * 60,
    desc: 'One-shot lemoncams history import; done-state ticks still ping. Delete this check when the cron is retired (#65).',
  },
  {
    name: 'cam-roster-sync',
    timeout: 10 * 60, // simple period: one success ping proves poller + feeds + secret + backend
    grace: 10 * 60,
    desc: 'Roster sync heartbeat (POST /api/cam-models/sync, every ~5 min). Silence = the sync chain is broken somewhere.',
  },
];

async function hc(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

const existing = new Map();
for (const c of (await hc('/checks/')).checks ?? []) existing.set(c.slug, c);

let created = 0;
let updated = 0;
let unchanged = 0;

for (const prefix of PREFIXES) {
  for (const check of CHECKS) {
    const slug = `${prefix}-${check.name}`;
    const body = {
      name: slug,
      slug,
      unique: ['slug'],
      grace: check.grace,
      desc: check.desc,
      channels: '*',
      ...(check.schedule ? { schedule: check.schedule, tz: 'UTC' } : { timeout: check.timeout }),
    };
    const current = existing.get(slug);
    const drift =
      current &&
      ((check.schedule && (current.schedule !== check.schedule || current.tz !== 'UTC')) ||
        (!check.schedule && current.timeout !== check.timeout) ||
        current.grace !== check.grace);
    if (current && !drift) {
      unchanged += 1;
      console.log(`  = ${slug} (up to date, status: ${current.status})`);
      continue;
    }
    console.log(`  ${current ? '~' : '+'} ${slug} ${check.schedule ? `cron "${check.schedule}" UTC` : `every ${check.timeout / 60}m`}, grace ${check.grace / 60}m${current ? ' (drift: updating)' : ''}`);
    if (APPLY) {
      await hc('/checks/', { method: 'POST', body: JSON.stringify(body) });
      current ? updated++ : created++;
    }
  }
}

console.log(
  APPLY
    ? `\nDone: ${created} created, ${updated} updated, ${unchanged} unchanged.`
    : `\nDry run only — re-run with --apply to write. (${existing.size} checks currently in the project.)`,
);
