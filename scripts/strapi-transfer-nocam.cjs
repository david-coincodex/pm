#!/usr/bin/env node
/**
 * strapi-transfer-nocam.cjs — `strapi transfer`, minus the environment-local cam data.
 *
 * cam-models (registry: activity histories, wentOnlineAt, firstSeenAt) and cam-favorites are
 * DYNAMIC PER-ENVIRONMENT data, regenerated on every host by the roster sync + crons. A full
 * content transfer must neither ship them nor delete them on the destination — a plain
 * `strapi transfer` does both (it is a REPLACE). The incremental push script already excludes
 * them; this wrapper closes the same hole for the full-sync path.
 *
 * HOW: the transfer CLI consults two helpers from dist/src/cli/utils/data-transfer.js through
 * the module object — `isIgnoredContentType` (the entities/links stream filters) and
 * `parseRestoreFromOptions` (what the DESTINATION deletes before restoring; the config is
 * computed locally and sent over the wire, so patching here protects the remote side too).
 * Both are patched in the require cache, then the stock CLI boots with the original argv.
 * Verified against Strapi 5's layout: dist/cli.js requires ./src/cli/* as plain CJS (not a
 * bundle), so the cache patch is the same module instance the action uses.
 *
 * VERSION-FRAGILE BY NATURE (reaches into @strapi/strapi dist internals). Every assumption is
 * guarded to fail LOUD before any transfer starts — this must never silently degrade into an
 * unfiltered full transfer. If it breaks after a Strapi upgrade, re-verify the two call sites
 * in dist/src/cli/commands/transfer/action.js and fix the paths/shapes here.
 *
 * Usage (inside a container with /app/node_modules): node strapi-transfer-nocam.cjs transfer <args…>
 */
const path = require('node:path');

const APP = process.env.STRAPI_APP_DIR || '/app';
const EXCLUDED = ['api::cam-model.cam-model', 'api::cam-favorite.cam-favorite'];

function die(msg) {
  console.error(`[transfer-nocam] FATAL: ${msg}`);
  console.error('[transfer-nocam] refusing to run an UNFILTERED transfer — fix the wrapper first.');
  process.exit(1);
}

const utilsPath = path.join(APP, 'node_modules/@strapi/strapi/dist/src/cli/utils/data-transfer.js');
let utils;
try {
  utils = require(utilsPath);
} catch (e) {
  die(`cannot load ${utilsPath} (${e.message}) — Strapi dist layout changed?`);
}
if (typeof utils.isIgnoredContentType !== 'function') die('isIgnoredContentType export missing');
if (typeof utils.parseRestoreFromOptions !== 'function') die('parseRestoreFromOptions export missing');

const origIgnored = utils.isIgnoredContentType;
utils.isIgnoredContentType = (uid) => EXCLUDED.includes(uid) || origIgnored(uid);

// parseRestoreFromOptions uses its own closure copy of the ignore check, so the first patch
// does not reach it — wrap the export and adjust BOTH shapes it can return: `include` (the
// config-skipped branch: types the destination DOES delete) and `exclude` (types it spares).
const origRestore = utils.parseRestoreFromOptions;
utils.parseRestoreFromOptions = (opts, strapiApp) => {
  const cfg = origRestore(opts, strapiApp);
  const entities = cfg && cfg.entities;
  if (!entities || typeof entities !== 'object') die('restore config shape changed — no entities options');
  if (Array.isArray(entities.include)) entities.include = entities.include.filter((uid) => !EXCLUDED.includes(uid));
  if (Array.isArray(entities.exclude)) entities.exclude.push(...EXCLUDED);
  if (!Array.isArray(entities.include) && !Array.isArray(entities.exclude)) {
    die('restore config has neither include nor exclude arrays');
  }
  return cfg;
};

// Self-check mode for CI/manual verification: proves the patches load and behave, runs nothing.
if (process.argv[2] === '--selfcheck') {
  if (!utils.isIgnoredContentType('api::cam-model.cam-model')) die('selfcheck: cam-model not ignored');
  if (utils.isIgnoredContentType('api::site.site')) die('selfcheck: site wrongly ignored');
  const fake = { contentTypes: { 'api::cam-model.cam-model': {}, 'api::site.site': {}, 'admin::user': {} } };
  const inc = utils.parseRestoreFromOptions({ only: ['content'] }, fake); // config skipped → include branch
  if (inc.entities.include && inc.entities.include.includes('api::cam-model.cam-model')) {
    die('selfcheck: include branch still deletes cam-models on destination');
  }
  const exc = utils.parseRestoreFromOptions({}, fake); // full scope → exclude branch
  if (exc.entities.exclude && !exc.entities.exclude.includes('api::cam-model.cam-model')) {
    die('selfcheck: exclude branch does not spare cam-models');
  }
  console.log('[transfer-nocam] selfcheck OK — excluded:', EXCLUDED.join(', '));
  process.exit(0);
}

console.log(`[transfer-nocam] excluding from transfer AND destination restore: ${EXCLUDED.join(', ')}`);
const { runCLI } = require(path.join(APP, 'node_modules/@strapi/strapi/dist/cli.js'));
runCLI(process.argv);
