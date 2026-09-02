#!/usr/bin/env node
/**
 * provision-healthchecks.mjs — create/update the Healthchecks.io checks that receive the
 * backend's heartbeat pings (backend/src/cron/heartbeat.ts, docs/monitoring.md).
 *
 * Single source of truth: backend/src/cron/checks.json — the SAME manifest config/server.ts
 * registers the cron rules from, so the monitor and the scheduler cannot drift. Re-run with
 * --apply after any manifest change.
 *
 * One Healthchecks project serves every environment; slugs carry the env prefix
 * (staging-cam-model-cleanup, prod-cam-model-cleanup, …). On --apply every check is upserted
 * unconditionally (`unique: ["slug"]`): the API converges desc/channels/schedule alike, so a
 * later-added integration (channels:"*") or edited description propagates on the next run —
 * a field-diff "skip if unchanged" would silently never converge those.
 *
 * Alerting itself is configured in Healthchecks (Integrations); our code never sends
 * notifications.
 *
 * Usage:
 *   node provision-healthchecks.mjs            # dry run: list desired vs current state
 *   node provision-healthchecks.mjs --apply    # upsert all checks
 *
 * Env (scripts/.env): HEALTHCHECKS_API_KEY — a READ-WRITE project API key
 * (Healthchecks → Project Settings → API Access). The ping key is NOT needed here.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withRetry } from './lib/http.mjs';

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
const MANIFEST = JSON.parse(readFileSync(join(__dirname, '..', 'backend', 'src', 'cron', 'checks.json'), 'utf-8'));

async function hc(path, init = {}) {
  return withRetry(
    async () => {
      const res = await fetch(`${API}${path}`, {
        ...init,
        headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${await res.text().catch(() => '')}`);
      return res.json();
    },
    { label: `healthchecks ${path}` },
  );
}

const existing = new Map();
for (const c of (await hc('/checks/')).checks ?? []) existing.set(c.slug, c);

let written = 0;
for (const prefix of PREFIXES) {
  for (const [name, check] of Object.entries(MANIFEST)) {
    const slug = `${prefix}-${name}`;
    const current = existing.get(slug);
    const shape = check.schedule ? `cron "${check.schedule}" UTC` : `every ${check.timeout / 60}m`;
    console.log(`  ${current ? '~' : '+'} ${slug} ${shape}, grace ${check.grace / 60}m${current ? ` (status: ${current.status})` : ' (new)'}`);
    if (!APPLY) continue;
    await hc('/checks/', {
      method: 'POST',
      body: JSON.stringify({
        name: slug,
        slug,
        unique: ['slug'],
        grace: check.grace,
        desc: check.desc,
        channels: '*',
        ...(check.schedule ? { schedule: check.schedule, tz: 'UTC' } : { timeout: check.timeout }),
      }),
    });
    written += 1;
  }
}

console.log(
  APPLY
    ? `\nDone: ${written} checks upserted (schedule, grace, desc, channels all converged).`
    : `\nDry run only — re-run with --apply to upsert. (${existing.size} checks currently in the project.)`,
);
