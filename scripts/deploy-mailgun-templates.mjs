#!/usr/bin/env node
/**
 * deploy-mailgun-templates.mjs
 *
 * Pushes the transactional templates in lib/email-templates.mjs to Mailgun, where the backend
 * then references them BY NAME (see backend/src/extensions/email/strapi-server.ts). Templates
 * live server-side at Mailgun so the copy and styling can be corrected without a deploy — and
 * so the same markup is guaranteed identical across environments.
 *
 * Idempotent: creates a template that does not exist, otherwise adds a new VERSION and makes it
 * active. Mailgun keeps the old versions, so a bad copy edit is one API call from a rollback.
 *
 * Usage:
 *   node scripts/deploy-mailgun-templates.mjs [--dry-run] [--only pm-confirm]
 *
 * Env (scripts/.env): MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_URL.
 */
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TEMPLATES } from './lib/email-templates.mjs';

const _require = createRequire(import.meta.url);
_require('dotenv').config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env'), quiet: true });

const KEY = process.env.MAILGUN_API_KEY;
const DOMAIN = process.env.MAILGUN_DOMAIN ?? 'pornmode.com';
const BASE = `${process.env.MAILGUN_URL ?? 'https://api.mailgun.net'}/v3/${DOMAIN}/templates`;
const DRY = process.argv.includes('--dry-run');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

if (!KEY) {
  console.error('MAILGUN_API_KEY missing from scripts/.env');
  process.exit(1);
}
const auth = 'Basic ' + Buffer.from(`api:${KEY}`).toString('base64');

/** Mailgun answers 200 for an existing template and 404 when it has never been created. */
async function exists(name) {
  const res = await fetch(`${BASE}/${name}`, { headers: { Authorization: auth } });
  return res.status === 200;
}

async function push(name, { subject, description, html }) {
  const body = new URLSearchParams({ template: html });
  if (await exists(name)) {
    // A new active version — Mailgun keeps the previous ones for rollback.
    body.set('tag', `v${Date.now()}`);
    body.set('active', 'yes');
    const res = await fetch(`${BASE}/${name}/versions`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return { action: 'new version', ok: res.ok, status: res.status, detail: await res.text() };
  }
  body.set('name', name);
  body.set('description', `${description} — subject: ${subject}`);
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return { action: 'created', ok: res.ok, status: res.status, detail: await res.text() };
}

const entries = Object.entries(TEMPLATES).filter(([name]) => !ONLY || name === ONLY);
console.log(`${DRY ? '[dry run] ' : ''}Deploying ${entries.length} template(s) to ${DOMAIN}\n`);

let failed = 0;
for (const [name, tpl] of entries) {
  const bytes = Buffer.byteLength(tpl.html, 'utf8');
  // Gmail clips messages over ~102KB, which would hide the footer and any link below the fold.
  const clipWarning = bytes > 100_000 ? '  ⚠ over Gmail’s ~102KB clipping threshold' : '';
  if (DRY) {
    console.log(`  ${name.padEnd(18)} ${bytes} bytes  subject: ${tpl.subject}${clipWarning}`);
    continue;
  }
  const r = await push(name, tpl);
  console.log(`  ${name.padEnd(18)} ${r.ok ? '✓ ' + r.action : '✗ ' + r.status + ' ' + r.detail.slice(0, 120)}  (${bytes} bytes)${clipWarning}`);
  if (!r.ok) failed++;
}

if (!DRY) console.log(`\nDone${failed ? ` — ${failed} failed` : ''}. The backend references these by name; no deploy needed for copy changes.`);
process.exit(failed ? 1 : 0);
