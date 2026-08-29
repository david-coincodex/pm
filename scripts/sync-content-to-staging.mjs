#!/usr/bin/env node
/**
 * sync-content-to-staging.mjs
 *
 * Copies CONTENT + MEDIA from the local dev Strapi to staging. Never admin users, API tokens,
 * webhooks, or Strapi settings — the transfer runs with `--only content,files`, so the `config`
 * scope (core-store, webhooks, roles/permissions) is left untouched on the destination.
 *
 * See sync-content-to-staging.md for the runbook, the backup layout, and rollback.
 *
 * ── Three facts this script exists to defend against ────────────────────────────────────────
 *
 * 1. THE LOCAL DB IS SHADOWED. docker-compose.yml mounts `strapi_tmp:/app/.tmp`, which hides the
 *    host file backend/.tmp/data.db. The container's copy is the real database (~31 MB); the host
 *    file is a stale leftover (~1.9 MB, weeks older). Every Strapi command therefore runs through
 *    `docker compose exec` — a host-side export would ship the stale data and still report success.
 *
 * 2. CLOUDFLARE ACCESS BLOCKS THE TRANSFER CLI. cms-staging.pornmode.com sits behind a Cloudflare
 *    Access application. Access is satisfied by two headers, but `strapi transfer` has no flag for
 *    custom headers, so it gets a 302 to a login page. `cloudflared access tcp` does NOT fix this:
 *    it opens a WebSocket to the ORIGIN, which a plain HTTP app behind Access does not speak
 *    (measured: `websocket: bad handshake`, every connection reset). So we run our own local
 *    reverse proxy that injects the headers — lib/cf-access-proxy.mjs.
 *
 * 3. TRANSFER REPLACES, IT DOES NOT MERGE. Staging content for the transferred types is deleted
 *    first. Staging has diverged from local, so the divergence report names what disappears, and
 *    a snapshot is taken before anything destructive.
 *
 * Usage:
 *   node scripts/sync-content-to-staging.mjs                 # DRY RUN: preflight + divergence
 *   node scripts/sync-content-to-staging.mjs --verify-only    # compare both sides, nothing else
 *   node scripts/sync-content-to-staging.mjs --apply          # snapshot, sync, verify
 *   node scripts/sync-content-to-staging.mjs --apply --only content   # skip the 385 MB media leg
 *
 * Options:
 *   --apply              Perform the sync (omit to preview). NOT WIRED YET — exits after preflight
 *                        with instructions; see the "Status" note in sync-content-to-staging.md.
 *   --verify-only        Only run the local-vs-staging comparison
 *   --only <scopes>      content | files | content,files   (default content,files)
 *   --no-snapshot        (reserved for --apply) skip the pre-sync snapshot
 *   --yes                (reserved for --apply) skip the typed REPLACE confirmation
 *   --force-user-wipe    Proceed even though staging has registered user accounts (the transfer
 *                        DELETES them — users-permissions data is replaced wholesale)
 *   --port <n>           Pin the CF Access proxy port (default: an ephemeral free port, so a
 *                        manually started proxy on 8443 never collides)
 *   --keep-proxy         Leave the proxy running after exit (for manual follow-up commands)
 *
 * Env (scripts/.env, or backend/.env for the transfer token):
 *   STAGING_TRANSFER_URL, STAGING_TRANSFER_TOKEN, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET,
 *   STRAPI_URL, STRAPI_TOKEN
 */

import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from './lib/strapi.mjs';
import { startCfAccessProxy } from './lib/cf-access-proxy.mjs';

const _require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
// backend/.env carries the transfer token; scripts/.env carries STRAPI_TOKEN and the CF pair.
_require('dotenv').config({ path: join(REPO, 'backend', '.env'), quiet: true });
_require('dotenv').config({ path: join(__dirname, '.env'), quiet: true });
_require('dotenv').config({ path: join(REPO, 'frontend', '.env.local'), quiet: true });

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  const next = argv[i + 1];
  return i !== -1 && next && !next.startsWith('--') ? next : fallback;
};
const APPLY = has('--apply');
const VERIFY_ONLY = has('--verify-only');
const NO_SNAPSHOT = has('--no-snapshot'); // reserved: takes effect once --apply is wired
const YES = has('--yes');                 // reserved: takes effect once --apply is wired
const FORCE_USER_WIPE = has('--force-user-wipe');
const KEEP_PROXY = has('--keep-proxy');
// Default 0 = ephemeral: the OS picks a free port, so this never collides with a manually
// started `npm run cf-proxy` on 8443. --port pins it when a fixed port is genuinely needed.
const PORT = Number(flag('--port', 0));
const ONLY = flag('--only', 'content,files');

if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  console.error(`Error: --port must be 0-65535, got "${flag('--port', 0)}".`);
  process.exit(1);
}
if (!['content', 'content,files', 'files,content'].includes(ONLY)) {
  // 'files' alone is rejected on purpose: the destination maps asset ids from the upload.file
  // entities restored in the SAME transfer session, so a files-only push always fails with
  // "File ID not found" — see the runApply() comment.
  console.error(`Error: --only must be content or content,files — got "${ONLY}". (files cannot be pushed alone)`);
  process.exit(1);
}

const STAGING_URL = process.env.STAGING_TRANSFER_URL ?? 'https://cms-staging.pornmode.com';
const TRANSFER_TOKEN = process.env.STAGING_TRANSFER_TOKEN;
const CF_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;
const LOCAL_URL = process.env.STRAPI_URL ?? 'http://localhost:1339';

/** Only this host may ever be a destination. A production copy must be a code change, not a flag. */
const ALLOWED_DESTINATIONS = ['cms-staging.pornmode.com'];

/** All 13 collection types, plural API ids. */
const COLLECTIONS = [
  'articles', 'authors', 'bundles', 'categories', 'commercials', 'featureds', 'offers',
  'pages', 'platforms', 'reviews', 'sales', 'sites', 'tags',
];
/** The draft&publish types — these need a draft-vs-published comparison, not just a total. */
const DP_COLLECTIONS = ['articles', 'bundles', 'commercials', 'pages', 'reviews', 'sales', 'sites'];

const ok = (s) => `  [32mOK[0m   ${s}`;
const bad = (s) => `  [31mFAIL[0m ${s}`;
const warn = (s) => `  [33mWARN[0m ${s}`;

const problems = [];
const fail = (msg) => { problems.push(msg); console.log(bad(msg)); };

// ── helpers ───────────────────────────────────────────────────────────────────
const dc = (args, opts = {}) =>
  execFileSync('docker', ['compose', ...args], { cwd: REPO, encoding: 'utf-8', ...opts });

/** Run a command inside the local backend container. */
const inBackend = (cmd) => dc(['exec', '-T', 'backend', 'sh', '-lc', cmd]).trim();

const FINGERPRINT_CMD = `find src/api src/components -name '*.json' | sort | xargs cat | sha256sum`;

/**
 * Content-type schema fingerprint. A schema mismatch makes `strapi transfer` fail MID-FLIGHT —
 * after the destination has already been emptied — so parity matters. It cannot be read from
 * staging over REST, so the preflight prints the local hash plus the exact command to run on the
 * staging host; the operator compares by eye.
 */
function localSchemaFingerprint() {
  return inBackend(`cd /app && ${FINGERPRINT_CMD}`).split(/\s+/)[0];
}

// ── preflight ─────────────────────────────────────────────────────────────────
async function preflight() {
  console.log('── Preflight ─────────────────────────────────────────────');

  console.log(warn(
    'This transfer REPLACES staging users-permissions data (users, roles, perms). Once real ' +
    'user accounts exist on staging, prefer push-changed-content.mjs — it never touches users.',
  ));

  // 1. destination allowlist
  const host = new URL(STAGING_URL).host;
  if (!ALLOWED_DESTINATIONS.includes(host)) {
    fail(`destination ${host} is not in the allowlist (${ALLOWED_DESTINATIONS.join(', ')})`);
    return null;
  }
  console.log(ok(`destination ${host} is allowlisted`));

  // 2. local container + the shadowed-DB trap
  let dbBytes = 0;
  try {
    dbBytes = Number(inBackend(`stat -c %s /app/.tmp/data.db`));
  } catch {
    fail('local backend container is not running (docker compose up -d backend)');
    return null;
  }
  const mb = (dbBytes / 1e6).toFixed(1);
  if (dbBytes < 20e6) {
    fail(`container DB is only ${mb} MB — expected >20 MB. Is this the right database?`);
  } else {
    console.log(ok(`container DB /app/.tmp/data.db is ${mb} MB`));
  }
  try {
    const hostBytes = statSync(join(REPO, 'backend/.tmp/data.db')).size;
    if (hostBytes < dbBytes) {
      console.log(warn(
        `host backend/.tmp/data.db is only ${(hostBytes / 1e6).toFixed(1)} MB and is SHADOWED by the ` +
        `strapi_tmp volume — this script reads the container's ${mb} MB copy, which is correct. ` +
        `Never run strapi export/transfer on the host.`,
      ));
    }
  } catch { /* host file may not exist at all, which is fine */ }

  // 3. credentials
  if (!CF_ID || !CF_SECRET) {
    fail('CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET missing — staging is behind Cloudflare Access');
    return null;
  }
  console.log(ok('Cloudflare Access service token present'));
  if (!TRANSFER_TOKEN) {
    fail('STAGING_TRANSFER_TOKEN missing (backend/.env) — mint one in staging admin → Settings → Transfer Tokens');
  } else if (!/^[0-9a-f]{64,}$/.test(TRANSFER_TOKEN)) {
    console.log(warn(
      `STAGING_TRANSFER_TOKEN does not look like a Strapi token (${TRANSFER_TOKEN.length} chars, ` +
      `expected a long lowercase hex string). Check for a truncated paste or stray whitespace.`,
    ));
  } else {
    // Shape alone proves nothing: "Authentication Error" from the transfer engine is far more often
    // the token's TYPE or expiry than its format. A Push-only token cannot serve `--from` (the
    // snapshot pulls), and vice versa — Full access covers both directions.
    console.log(ok(`STAGING_TRANSFER_TOKEN present (${TRANSFER_TOKEN.length} hex chars)`));
  }

  // 4. proxy + staging reachability
  const proxy = await startCfAccessProxy({
    target: STAGING_URL, clientId: CF_ID, clientSecret: CF_SECRET, port: PORT, quiet: true,
  });
  // Only ever a STAGING token here. Passing the local STRAPI_TOKEN would be wrong (it is not valid
  // there) and produces confusing 401s that look like staging is down.
  const staging = createClient({
    baseUrl: proxy.url, token: process.env.STAGING_STRAPI_TOKEN, label: 'staging',
  });
  try {
    const health = await staging.raw('/_health');
    if (health.status === 204) console.log(ok(`staging reachable through the CF Access proxy (${proxy.url})`));
    else fail(`staging /_health returned ${health.status} through the proxy`);
  } catch (e) {
    fail(`staging unreachable through the proxy: ${e.message}`);
  }

  // 5. version + schema parity — a version or schema mismatch fails the transfer MID-FLIGHT,
  // after the destination is already emptied. Neither is readable from staging over REST, so
  // print the local values with the exact command for a manual staging-side comparison.
  const localVer = inBackend(`node -p "require('/app/node_modules/@strapi/strapi/package.json').version"`);
  console.log(ok(`local Strapi ${localVer} — confirm staging matches (admin footer)`));
  const fp = localSchemaFingerprint();
  console.log(ok(`local schema fingerprint ${fp.slice(0, 16)}…`));
  console.log(warn(
    `compare on the staging host with:  docker compose -f /opt/promode/docker-compose.yml ` +
    `exec -T backend sh -c "cd /app && ${FINGERPRINT_CMD}"`,
  ));

  // 6. registered users on staging — the transfer REPLACES users-permissions data wholesale,
  // so real accounts (cam favorites, logins) would be silently erased. This is a hard stop,
  // not a warning: once accounts exist, content must flow through push-changed-content.mjs.
  try {
    const res = await staging.raw('/api/users/count');
    if (res.status === 200) {
      const n = Number((await res.text()).trim());
      if (Number.isFinite(n) && n > 0) {
        if (FORCE_USER_WIPE) {
          console.log(warn(`staging has ${n} registered user account(s) — proceeding because --force-user-wipe was passed. They WILL be deleted.`));
        } else {
          fail(`staging has ${n} registered user account(s); the transfer would DELETE them. Use push-changed-content.mjs for content, or pass --force-user-wipe if erasing the accounts is intended.`);
          return null;
        }
      } else {
        console.log(ok('staging has no registered user accounts'));
      }
    } else {
      console.log(warn(`could not count staging users (HTTP ${res.status}) — verify manually in staging admin before --apply, or grant the staging API token access to users-permissions count`));
    }
  } catch (e) {
    console.log(warn(`could not count staging users: ${e.message} — verify manually in staging admin before --apply`));
  }

  // 7. media-URL invariant: an absolute localhost URL would ship into staging content
  try {
    const out = execFileSync('node', [join(__dirname, 'normalize-media-urls.mjs'), '--check'], { encoding: 'utf-8' });
    if (/all stored media URLs are relative/.test(out)) console.log(ok('media URLs are all root-relative'));
    else fail('normalize-media-urls.mjs --check did not pass — absolute URLs would ship to staging');
  } catch {
    fail('could not run normalize-media-urls.mjs --check');
  }

  return { proxy, staging };
}

// ── divergence / verification ─────────────────────────────────────────────────
/**
 * Count a collection, preferring the complete (draft) set but degrading to published-only.
 *
 * Reading drafts needs an API token. Staging's public role permits published reads but not
 * `status=draft`, so without STAGING_STRAPI_TOKEN every draft query 401s. Rather than reporting
 * that as an error, fall back to published and say so — a published-only comparison is still the
 * useful part of the report, and pretending otherwise would hide real numbers behind "ERR".
 */
async function countBest(client, collection) {
  try {
    return { n: await client.count(collection, 'status=draft'), mode: 'draft' };
  } catch (e) {
    if (!/\b401\b/.test(e.message)) return { n: 'ERR', mode: 'error', err: e.message };
    try {
      return { n: await client.count(collection), mode: 'published' };
    } catch (e2) {
      return { n: 'ERR', mode: 'error', err: e2.message };
    }
  }
}

async function compare(staging) {
  const local = createClient({ baseUrl: LOCAL_URL, token: process.env.STRAPI_TOKEN, label: 'local' });
  const hasStagingToken = Boolean(process.env.STAGING_STRAPI_TOKEN);

  console.log('\n── Content comparison (local -> staging) ─────────────────');
  if (!hasStagingToken) {
    console.log(warn(
      'STAGING_STRAPI_TOKEN not set — staging counts are PUBLISHED-ONLY. Unpublished drafts on ' +
      'staging are invisible here, so a delta of 0 does not prove the two sides match. Set a ' +
      'staging API token for a complete comparison.',
    ));
  }
  console.log('  collection      local  staging   delta');
  // All 26 counts in flight at once (they were sequential: 13 collections x 2 sides x ~200ms
  // staging RTT = several seconds of pure waiting). Output order stays stable because we print
  // after collecting.
  const rows = await Promise.all(
    COLLECTIONS.map(async (c) => {
      const [L, S] = await Promise.all([countBest(local, c), countBest(staging, c)]);
      const delta = typeof L.n === 'number' && typeof S.n === 'number' ? L.n - S.n : null;
      return { c, local: L, staging: S, delta };
    }),
  );
  for (const { c, local: L, staging: S, delta } of rows) {
    const mark = delta === null ? '  (incomparable)'
      : delta === 0 ? ''
      : delta > 0 ? `  +${delta} to add` : `  ${-delta} to remove`;
    const note = S.mode === 'published' ? ' *' : '';
    console.log(
      `  ${c.padEnd(14)} ${String(L.n).padStart(5)}  ${String(S.n).padStart(7)}${note}   ` +
      `${String(delta ?? '?').padStart(5)}${mark}`,
    );
  }
  if (rows.some((r) => r.staging.mode === 'published')) console.log('  * staging figure is published-only');

  // Draft vs published on the LOCAL side: this is what will be pushed. A transfer that arrived but
  // lost publish state renders an empty site while every published-only check still passes, so the
  // post-sync verification compares both numbers.
  console.log('\n  local draft vs published (what gets pushed):');
  for (const c of DP_COLLECTIONS) {
    try {
      const [ld, lp] = await Promise.all([local.count(c, 'status=draft'), local.count(c)]);
      const unpub = ld - lp;
      console.log(`  ${c.padEnd(14)} ${String(ld).padStart(4)} total, ${String(lp).padStart(4)} published${unpub ? `, ${unpub} unpublished` : ''}`);
    } catch (e) {
      console.log(warn(`${c}: ${e.message.slice(0, 80)}`));
    }
  }

  // Name the records that would disappear — the most valuable line of the dry run.
  console.log('\n  what a sync would change on staging (by slug):');
  const slugDiffs = await Promise.all(
    ['sites', 'categories', 'articles'].map(async (c) => {
      try {
        const lsP = local.fetchAll(c, 'fields[0]=slug&status=draft');
        // Staging: drafts need a token; fall back to published-only and flag it.
        let ss, partial = false;
        try {
          ss = await staging.fetchAll(c, 'fields[0]=slug&status=draft');
        } catch (e) {
          if (!/\b401\b/.test(e.message)) throw e;
          ss = await staging.fetchAll(c, 'fields[0]=slug');
          partial = true;
        }
        const ls = await lsP;
        const localSlugs = new Set(ls.map((x) => x.slug));
        const stagingSlugs = new Set(ss.map((x) => x.slug));
        const gone = [...stagingSlugs].filter((s) => !localSlugs.has(s));
        const added = [...localSlugs].filter((s) => !stagingSlugs.has(s));
        return { c, gone, added, partial };
      } catch (e) {
        return { c, error: e.message.slice(0, 80) };
      }
    }),
  );
  for (const d of slugDiffs) {
    if (d.error) { console.log(warn(`${d.c}: ${d.error}`)); continue; }
    const show = (list, n) => (list.length ? ': ' + list.slice(0, n).join(', ') + (list.length > n ? ` … +${list.length - n}` : '') : '');
    console.log(`  ${d.c.padEnd(12)} remove ${String(d.gone.length).padStart(3)}${show(d.gone, 8)}${d.partial ? '   (published-only view)' : ''}`);
    console.log(`  ${''.padEnd(12)} add    ${String(d.added.length).padStart(3)}${show(d.added, 5)}`);
  }

  // Media
  console.log('\n  media:');
  try {
    const lf = await local.api('/upload/files');
    const mb = (a) => (a.reduce((n, f) => n + (f.size ?? 0), 0) / 1024).toFixed(0);
    let sInfo = 'staging n/a (needs STAGING_STRAPI_TOKEN)';
    try {
      const sf = await staging.api('/upload/files');
      sInfo = `staging ${sf.length} files, ~${mb(sf)} MB`;
    } catch (e) {
      // 401 = no token; 403 = public role lacks upload.read — both mean "needs a token" here.
      if (!/\b40[13]\b/.test(e.message)) sInfo = `staging error: ${e.message.slice(0, 60)}`;
    }
    console.log(`  local ${lf.length} files, ~${mb(lf)} MB   |   ${sInfo}`);
  } catch (e) {
    console.log(warn(`upload/files: ${e.message.slice(0, 90)}`));
  }
  const onDisk = inBackend(`find /app/public/uploads -type f | wc -l`);
  const duSize = inBackend(`du -sh /app/public/uploads | cut -f1`);
  console.log(`  local on disk  ${onDisk.trim()} files, ${duSize}`);

  return rows;
}

// ── apply ─────────────────────────────────────────────────────────────────────
/**
 * Run a command with live output; reject on non-zero exit.
 *
 * MUST be async (`spawn`, never `spawnSync`): the CF Access proxy runs in THIS process, and the
 * child transfers connect back through it. `spawnSync` blocks the event loop, which leaves the
 * proxy accepting TCP connections it can never service — the child then hangs forever on a
 * half-open handshake. Measured: a snapshot pull sat idle for 25 minutes exactly this way.
 */
function sh(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: REPO });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.slice(0, 6).join(' ')}… exited ${code}`));
    });
  });
}

async function confirmReplace() {
  if (YES) return true;
  if (!process.stdin.isTTY) {
    console.log('\nRefusing to --apply: no TTY for the REPLACE confirmation. Pass --yes to run non-interactively.');
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\nStaging content for the transferred types will be REPLACED. Type REPLACE to continue: ');
  rl.close();
  return answer.trim() === 'REPLACE';
}

/**
 * Snapshot staging, then push local -> staging as ONE transfer.
 *
 * The push is deliberately a single `--only content,files` run, never split into a content leg
 * and a files leg. Splitting looks attractive (retry only the 385 MB media stream on failure) but
 * cannot work: the destination's asset writer resolves each incoming asset through a source-id ->
 * destination-id map built from the upload.file ENTITIES restored in the same transfer session
 * (see @strapi/data-transfer local-destination/assets-destination-writable, resolveUploadFileId).
 * A files-only push restores no entities, the map is empty, and the very first asset dies with
 * "File ID not found for ID: <n>" — measured, after a content-only leg had already cleared and
 * repopulated staging's content.
 */
async function runApply(proxyPort, snapshotTs) {
  const to = [`--to`, `http://host.docker.internal:${proxyPort}/admin`, `--to-token`, TRANSFER_TOKEN];

  if (!NO_SNAPSHOT) {
    console.log(`\n── Snapshot: pulling staging into pmsnap-${snapshotTs} ──────────`);
    await sh('docker', [
      'compose', '-f', 'docker-compose.backup.yml', '-p', `pmsnap-${snapshotTs}`, 'run', '--rm', 'scratch',
      '/app/node_modules/.bin/strapi', 'transfer',
      '--from', `http://host.docker.internal:${proxyPort}/admin`, '--from-token', TRANSFER_TOKEN,
      '--only', 'content,files', '--force',
    ]);
    console.log(`   snapshot volumes: pmsnap-${snapshotTs}_snapshot_db / _snapshot_public`);
  } else {
    console.log(warn('--no-snapshot: skipping the pre-sync snapshot. Rollback relies on an earlier snapshot.'));
  }

  console.log(`\n── Push: ${ONLY} (local -> staging) ─────────────────────────`);
  // Runs inside the dev backend container so it reads the REAL (volume-mounted) database —
  // see fact 1 in the header. If the dev server holds a write lock (SQLITE_BUSY), stop it and
  // use `docker compose run --rm backend …` instead.
  await sh('docker', [
    'compose', 'exec', '-T', 'backend',
    '/app/node_modules/.bin/strapi', 'transfer', ...to, '--only', ONLY, '--force',
  ]);
}

/**
 * Post-sync check: staging (published) must now equal local (published) on every collection.
 * Local content is fully published, so published-vs-published is a complete comparison even
 * without a staging API token. Media is spot-fetched by URL through the proxy — /api/upload/files
 * needs a token, but the files themselves are public.
 */
async function verifyAfter(staging, local) {
  console.log('\n── Post-sync verification ────────────────────────────────');
  let failures = 0;

  const counts = await Promise.all(
    COLLECTIONS.map(async (c) => {
      const [l, s] = await Promise.all([
        local.count(c).catch(() => 'ERR'),
        staging.count(c).catch(() => 'ERR'),
      ]);
      return { c, l, s };
    }),
  );
  for (const { c, l, s } of counts) {
    const match = l === s && typeof l === 'number';
    if (!match) failures += 1;
    console.log(`  ${match ? 'OK  ' : 'FAIL'} ${c.padEnd(14)} local ${String(l).padStart(4)}  staging ${String(s).padStart(4)}`);
  }

  // Media spot-fetch: sample local file URLs (they must now exist on staging), plus one format.
  try {
    const files = await local.api('/upload/files');
    const picks = [files[0], files[Math.floor(files.length / 2)], files[files.length - 1]]
      .filter(Boolean)
      .map((f) => f.url)
      .concat(files.find((f) => f.formats?.thumbnail?.url)?.formats.thumbnail.url ?? []);
    for (const url of picks) {
      const res = await staging.raw(url);
      const okFetch = res.status === 200 && Number(res.headers.get('content-length') ?? 1) > 0;
      if (!okFetch) failures += 1;
      console.log(`  ${okFetch ? 'OK  ' : 'FAIL'} media ${res.status}  ${url}`);
    }
  } catch (e) {
    failures += 1;
    console.log(bad(`media spot-fetch: ${e.message.slice(0, 90)}`));
  }

  return failures;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${APPLY ? 'APPLY' : VERIFY_ONLY ? 'VERIFY' : 'DRY RUN'} — ${LOCAL_URL} -> ${STAGING_URL}  (--only ${ONLY})\n`);

  const pre = await preflight();
  if (!pre) { console.log('\nPreflight failed. Nothing was touched.'); process.exit(1); }
  const { proxy, staging } = pre;

  try {
    await compare(staging);

    if (problems.length) {
      console.log(`\n${problems.length} preflight problem(s):`);
      problems.forEach((p) => console.log(`  - ${p}`));
    }

    if (!APPLY) {
      if (VERIFY_ONLY) {
        console.log('\nVerification only — nothing was changed.');
        if (problems.length) process.exitCode = 1;
      } else {
        console.log(
          problems.length
            ? '\nDry run — resolve the problems above before using --apply.'
            : '\nDry run — re-run with --apply to snapshot, sync, and verify.',
        );
      }
      return;
    }

    if (problems.length) {
      console.log('\nRefusing to --apply with unresolved preflight problems.');
      process.exit(1);
    }

    if (!(await confirmReplace())) {
      console.log('Aborted — nothing was changed.');
      process.exit(1);
    }

    const snapshotTs = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    try {
      await runApply(proxy.port, snapshotTs);
    } catch (e) {
      console.error(`\nTransfer failed: ${e.message}`);
      if (!NO_SNAPSHOT) {
        console.error(
          `Staging may be partially updated. Roll back with:\n` +
          `  node scripts/lib/cf-access-proxy.mjs --port 8443 &\n` +
          `  docker compose -f docker-compose.backup.yml -p pmsnap-${snapshotTs} run --rm scratch \\\n` +
          `    /app/node_modules/.bin/strapi transfer --to http://host.docker.internal:8443/admin \\\n` +
          `    --to-token "$STAGING_TRANSFER_TOKEN" --only content,files --force`,
        );
      }
      process.exit(1);
    }

    const local = createClient({ baseUrl: LOCAL_URL, token: process.env.STRAPI_TOKEN, label: 'local' });
    const failures = await verifyAfter(staging, local);

    console.log('\n── Done ──────────────────────────────────────────────────');
    if (failures) {
      console.log(`${failures} verification failure(s) — inspect before trusting staging.`);
      if (!NO_SNAPSHOT) console.log(`Rollback snapshot: pmsnap-${snapshotTs}`);
      process.exit(1);
    }
    console.log('All verifications passed.');
    if (!NO_SNAPSHOT) console.log(`Rollback snapshot kept: pmsnap-${snapshotTs} (remove later with: docker compose -f docker-compose.backup.yml -p pmsnap-${snapshotTs} down -v)`);
    console.log(
      '\nStaging frontend caches are NOT busted by a transfer (it bypasses Strapi webhooks).\n' +
      'Pages refresh as their revalidate windows lapse (most 5–60 min, sitemaps 24 h). To force it:\n' +
      '  ssh deploy@<staging-host> "cd /opt/promode && docker compose up -d --force-recreate frontend"',
    );
  } finally {
    if (KEEP_PROXY) console.log(`\nproxy left running at ${proxy.url} (--keep-proxy)`);
    else await proxy.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
