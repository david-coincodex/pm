#!/usr/bin/env node
/**
 * push-changed-content.mjs
 *
 * INCREMENTAL local -> staging content push: only new/changed entries, only new media files.
 * The counterpart to sync-content-to-staging.mjs, which is a FULL REPLACE (`strapi transfer`
 * re-streams every entity and every asset, ~385 MB, each run — the protocol has no delta mode).
 * Use this for day-to-day content pushes; keep the transfer script for full resyncs.
 *
 * ── How identity works across the two instances ────────────────────────────────────────────
 *
 * REST refuses a client-supplied documentId ("Invalid key documentId", measured), so an entity
 * created here and pushed by this script gets a DIFFERENT documentId on staging. Three
 * consequences shape the whole design:
 *
 * 1. Entities are matched by NATURAL KEY (slug for most types; name for platforms/featureds;
 *    site.slug for reviews; (site, offerKind, offerType, credits) for offers), never by
 *    documentId. The match also builds a local->staging documentId map. Renaming an entity
 *    locally therefore changes its identity: the rename arrives as a NEW entity and the old
 *    one lingers on staging as `only-on-staging` (removed by --prune).
 * 2. Relations in write payloads are remapped through that map (owning sides only — mappedBy
 *    inverse sides are skipped, the owning side writes the link).
 * 3. Rich-text HTML embeds documentIds (widget markup: data-commercial-id, data-site-id) and
 *    media URLs. Every string field of a pushed entity gets those occurrences rewritten — in
 *    a SINGLE alternation-regex pass, so one replacement can never chain into another — via
 *    the documentId map and the file-URL map (original URLs and format variants alike).
 *    Articles are pushed LAST so the entities their widgets reference are already mapped.
 *
 * Media identity: upload files carry a content `hash` preserved by `strapi transfer`, so
 * transferred files match by hash. A file uploaded over REST gets a fresh hash AND staging
 * re-optimizes images (so even the size drifts) — such files match by (name, mime), preferring
 * an exact size match, else the oldest candidate. A file matched either way is NEVER
 * re-uploaded — which also means a locally EDITED file with an unchanged filename never
 * propagates (see the .md limitations).
 *
 * ── What this script never touches ──────────────────────────────────────────────────────────
 * Admin users, API/transfer tokens, webhooks, settings, users-permissions — REST content
 * endpoints only. Staging-only entries are REPORTED, deleted only with --prune (reverse
 * dependency order). Staging-only FILES are reported but never deleted.
 *
 * ── Guards for setups this script cannot serve ──────────────────────────────────────────────
 * - More than one i18n locale: REST reads return the default locale only, so non-default
 *   locales would silently never push — the preflight refuses and points at the transfer.
 * - A collection missing from PUSH_ORDER: refused at startup rather than silently skipped.
 * - A collection whose natural key resolves undefined: refused (a shared undefined key would
 *   collapse every row into one match and PUT them over each other).
 *
 * Usage:
 *   node scripts/push-changed-content.mjs                  # DRY RUN: full diff, no writes
 *   node scripts/push-changed-content.mjs --apply           # push new/changed + new files
 *   node scripts/push-changed-content.mjs --apply --prune   # also delete staging-only entries
 *
 * Options:
 *   --only <a,b>   Restrict to these collections (plural api ids)
 *   --yes          Skip the confirmation prompt
 *   --port <n>     Pin the CF Access proxy port (default: ephemeral)
 *   --keep-proxy   Leave the proxy running on exit
 *
 * Env: STRAPI_URL + STRAPI_TOKEN (local), STAGING_STRAPI_TOKEN (staging API token — REQUIRED,
 * the transfer token cannot serve REST), CF_ACCESS_CLIENT_ID/SECRET, STAGING_TRANSFER_URL
 * (host only; defaults to cms-staging.pornmode.com).
 */

import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from './lib/strapi.mjs';
import { getBuffer } from './lib/http.mjs';
import { startCfAccessProxy } from './lib/cf-access-proxy.mjs';

const _require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
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
const PRUNE = has('--prune');
const YES = has('--yes');
const KEEP_PROXY = has('--keep-proxy');
const PORT = Number(flag('--port', 0));
const ONLY = flag('--only', '').split(',').filter(Boolean);

const STAGING_URL = process.env.STAGING_TRANSFER_URL ?? 'https://cms-staging.pornmode.com';
const LOCAL_URL = process.env.STRAPI_URL ?? 'http://localhost:1339';
const CF_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

/** Only this host may ever be a destination. A production push must be a code change, not a flag. */
const ALLOWED_DESTINATIONS = ['cms-staging.pornmode.com'];

const ok = (s) => `  \x1b[32mOK\x1b[0m   ${s}`;
const bad = (s) => `  \x1b[31mFAIL\x1b[0m ${s}`;
const warn = (s) => `  \x1b[33mWARN\x1b[0m ${s}`;

// ── Schema-driven collection model ────────────────────────────────────────────
/**
 * Field handling comes from the backend schema JSONs on disk, so a new FIELD is picked up
 * automatically. New COLLECTIONS are not automatic — they need a PUSH_ORDER position (and
 * possibly a natural key) — so main() refuses to run when a schema is missing from the list,
 * instead of silently never pushing it.
 */
function loadSchemas() {
  const apiDir = join(REPO, 'backend', 'src', 'api');
  const out = new Map(); // plural -> model
  for (const name of readdirSync(apiDir)) {
    const p = join(apiDir, name, 'content-types', name, 'schema.json');
    if (!existsSync(p)) continue;
    const schema = JSON.parse(readFileSync(p, 'utf8'));
    const attrs = schema.attributes;
    const model = {
      singular: schema.info.singularName,
      plural: schema.info.pluralName,
      draftAndPublish: schema.options?.draftAndPublish !== false,
      media: [], writeRelations: [], skipRelations: [], components: [], scalars: [],
    };
    for (const [key, a] of Object.entries(attrs)) {
      // writable:false = computed by a lifecycle (e.g. review.overallScore) — REST rejects
      // it as an "Invalid key" in a write body, and the destination recomputes it anyway.
      if (a.writable === false) continue;
      if (a.type === 'media') model.media.push(key);
      else if (a.type === 'relation') (a.mappedBy ? model.skipRelations : model.writeRelations).push(key);
      else if (a.type === 'component' || a.type === 'dynamiczone') model.components.push(key);
      else model.scalars.push(key);
    }
    out.set(model.plural, model);
  }
  return out;
}

/** Media inside components is not supported (no remap path) — refuse loudly if one appears. */
function assertNoComponentMedia() {
  const compDir = join(REPO, 'backend', 'src', 'components');
  const offenders = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) {
        const attrs = JSON.parse(readFileSync(p, 'utf8')).attributes ?? {};
        for (const [k, a] of Object.entries(attrs)) if (a.type === 'media') offenders.push(`${p}:${k}`);
      }
    }
  };
  walk(compDir);
  if (offenders.length) {
    throw new Error(`components with media fields are not supported by this script:\n  ${offenders.join('\n  ')}`);
  }
}

/**
 * Push order: relation targets before referrers; articles LAST (their HTML embeds documentIds).
 * bundles sits after sites (bundle.sites is owning) but BEFORE offers and sales, which both own
 * relations to bundles (offer.bundle, sale.bundles) — the reverse order 400s on a new bundle.
 */
const PUSH_ORDER = [
  'platforms', 'authors', 'categories', 'tags', 'sites', 'bundles', 'offers', 'commercials',
  'reviews', 'pages', 'sales', 'featureds', 'articles',
];

/**
 * Natural key per collection — the cross-instance identity (documentIds differ, see header).
 * Queries also fetch a human label so the diff report can say what an entry IS, not just
 * its key.
 */
const KEY_QUERY = {
  offers: 'fields[0]=offerKind&fields[1]=offerType&fields[2]=credits&fields[3]=updatedAt&fields[4]=publishedAt&fields[5]=price&fields[6]=full_price&populate[site][fields][0]=slug',
  reviews: 'fields[0]=updatedAt&fields[1]=publishedAt&fields[2]=displayTitle&populate[site][fields][0]=slug',
  featureds: 'fields[0]=name&fields[1]=updatedAt&fields[2]=publishedAt&populate[site][fields][0]=slug',
  platforms: 'fields[0]=name&fields[1]=updatedAt&fields[2]=publishedAt',
};
const LABEL_FIELD = {
  articles: 'title', pages: 'title', sales: 'title',
  sites: 'name', bundles: 'name', categories: 'name', tags: 'name', authors: 'name',
  platforms: 'name', featureds: 'name', commercials: 'title', reviews: 'displayTitle',
};
const keyQueryFor = (plural) => {
  const base = KEY_QUERY[plural] ?? 'fields[0]=slug&fields[1]=updatedAt&fields[2]=publishedAt';
  const extra = LABEL_FIELD[plural] && !base.includes(LABEL_FIELD[plural]) ? `&fields[9]=${LABEL_FIELD[plural]}` : '';
  return base + extra;
};
const entryLabel = (plural, e) => {
  if (plural === 'offers') return `$${e.price}${e.full_price ? ` (was $${e.full_price})` : ''}`;
  return e[LABEL_FIELD[plural]] ?? e.slug ?? '';
};
const naturalKey = (plural, e) => {
  const key =
    plural === 'offers' ? `${e.site?.slug ?? '?'}|${e.offerKind}|${e.offerType}|${e.credits ?? ''}`
    : plural === 'reviews' ? (e.site?.slug ? `review:${e.site.slug}` : undefined)
    : plural === 'featureds' ? `${e.name}|${e.site?.slug ?? ''}`
    : plural === 'platforms' ? e.name
    : e.slug;
  // An undefined key would collapse every row of the collection into ONE map entry, and the
  // push would PUT each "changed" entity over the same staging row — silent data destruction.
  if (key === undefined || key === null || key === '') {
    throw new Error(`${plural}: natural key resolved empty for documentId ${e.documentId} — define one in KEY_QUERY/naturalKey`);
  }
  return key;
};

// ── Diff ──────────────────────────────────────────────────────────────────────
/** Duplicate natural keys make the diff structurally unable to pair entities — refuse to guess. */
function assertUniqueKeys(plural, side, entities) {
  const seen = new Map();
  for (const e of entities) {
    const k = naturalKey(plural, e);
    if (seen.has(k)) {
      throw new Error(`${plural} (${side}): duplicate natural key "${k}" — resolve the duplicate or use the full transfer`);
    }
    seen.set(k, true);
  }
}

async function diffCollection(local, staging, plural, draftAndPublish) {
  const q = `${keyQueryFor(plural)}&status=draft`;
  // publishedAt on a status=draft row of a draft&publish type is ALWAYS null (measured on
  // pages) — the publish state must come from the published-version set, or every entity
  // reads as a draft and the ?status=published write logic silently never fires.
  const [ls, ss, publishedRows] = await Promise.all([
    local.fetchAll(plural, q),
    staging.fetchAll(plural, q),
    draftAndPublish ? local.fetchAll(plural, 'fields[0]=updatedAt') : Promise.resolve(null),
  ]);
  const publishedSet = publishedRows ? new Set(publishedRows.map((e) => e.documentId)) : null;
  const isPublished = (le) => (publishedSet ? publishedSet.has(le.documentId) : true);
  assertUniqueKeys(plural, 'local', ls);
  assertUniqueKeys(plural, 'staging', ss);
  const sByKey = new Map(ss.map((e) => [naturalKey(plural, e), e]));
  const lKeys = new Set(ls.map((e) => naturalKey(plural, e)));
  const created = [], changed = [];
  const docIdMap = new Map(); // local documentId -> staging documentId
  for (const le of ls) {
    const key = naturalKey(plural, le);
    const se = sByKey.get(key);
    if (!se) { created.push({ key, local: le, published: isPublished(le) }); continue; }
    docIdMap.set(le.documentId, se.documentId);
    // Strictly newer: a push stamps staging's own updatedAt (> local's), so pushed entries
    // settle as unchanged and the diff is idempotent. != would re-push forever.
    if (new Date(le.updatedAt) > new Date(se.updatedAt)) {
      changed.push({ key, local: le, staging: se, published: isPublished(le) });
    }
  }
  const stagingOnly = ss.filter((e) => !lKeys.has(naturalKey(plural, e))).map((e) => ({ key: naturalKey(plural, e), staging: e }));
  return { plural, created, changed, stagingOnly, docIdMap };
}

// ── Approval report ───────────────────────────────────────────────────────────
const summarizeValue = (v) => {
  if (v === null || v === undefined) return '*(empty)*';
  if (typeof v === 'string') {
    const s = v.replace(/\s+/g, ' ').trim();
    return s.length > 120 ? `${s.slice(0, 120)}… *(${v.length} chars)*` : s || '*(empty)*';
  }
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  }
  return String(v);
};

/**
 * Field-level diff of one changed entity: which writable fields differ between the local and
 * staging versions, with short before → after previews. Relations and media compare by human
 * labels (documentIds/file ids legitimately differ across the two instances).
 */
function diffEntityFields(model, localFull, stagingFull) {
  const changes = [];
  for (const key of model.scalars) {
    const a = stagingFull[key] ?? null, b = localFull[key] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push({ field: key, before: summarizeValue(a), after: summarizeValue(b) });
    }
  }
  const labels = (v) => (v == null ? '*(none)*'
    : (Array.isArray(v) ? v : [v]).map((x) => x?.name ?? x?.title ?? x?.slug ?? x?.documentId ?? '?').join(', ') || '*(none)*');
  for (const key of [...model.media, ...model.writeRelations]) {
    const a = labels(stagingFull[key]), b = labels(localFull[key]);
    if (a !== b) changes.push({ field: key, before: a, after: b });
  }
  for (const key of model.components) {
    const strip = (v) => JSON.stringify(v ?? null, (k, val) => (k === 'id' || k === 'documentId' || k === '__temp_key__' ? undefined : val));
    if (strip(stagingFull[key]) !== strip(localFull[key])) {
      const count = (v) => (Array.isArray(v) ? `${v.length} item(s)` : v ? '1 item' : '*(none)*');
      changes.push({ field: key, before: count(stagingFull[key]), after: count(localFull[key]) });
    }
  }
  return changes;
}

/** Markdown approval report: everything an --apply would do, reviewable before consenting. */
function renderReport({ pushed, diffs, fieldDiffs, newFiles, stagingOnlyFiles, prune }) {
  const lines = [
    `# Content push report — local → staging`,
    ``,
    `Generated ${new Date().toISOString()}. Nothing has been written; this is what \`--apply\` would do.`,
    ``,
  ];
  for (const plural of pushed) {
    const d = diffs.get(plural);
    if (!d.created.length && !d.changed.length && !d.stagingOnly.length) continue;
    lines.push(`## ${plural}`, ``);
    for (const { key, local: le, published } of d.created) {
      lines.push(`- **NEW** \`${key}\` — “${entryLabel(plural, le)}” (${published ? 'published' : 'DRAFT'})`);
    }
    for (const { key, local: le, published } of d.changed) {
      lines.push(`- **CHANGED** \`${key}\` — “${entryLabel(plural, le)}” (${published ? 'published' : 'DRAFT'})`);
      const fields = fieldDiffs.get(`${plural}:${key}`) ?? [];
      if (!fields.length) lines.push(`  - *(no field-level differences — timestamps only; the push is a no-op re-write)*`);
      for (const c of fields) lines.push(`  - \`${c.field}\`: ${c.before} → ${c.after}`);
    }
    for (const { key, staging: se } of d.stagingOnly) {
      lines.push(`- **${prune ? 'WILL DELETE' : 'only on staging'}** \`${key}\` — “${entryLabel(plural, se)}”`);
    }
    lines.push(``);
  }
  if (newFiles.length) {
    lines.push(`## New media files (${newFiles.length})`, ``);
    for (const f of newFiles) lines.push(`- ${f.name} (${f.size} KB${f.alternativeText ? `, alt: “${f.alternativeText}”` : ''})`);
    lines.push(``);
  }
  if (stagingOnlyFiles.length) {
    lines.push(`## Staging-only files (never deleted by this script)`, ``,
      ...stagingOnlyFiles.slice(0, 30).map((f) => `- ${f.name}`),
      ...(stagingOnlyFiles.length > 30 ? [`- … +${stagingOnlyFiles.length - 30} more`] : []), ``);
  }
  lines.push(`---`, `Approve by running: \`node scripts/push-changed-content.mjs --apply\``, ``);
  return lines.join('\n');
}

/**
 * The upload plugin's REST returns bare arrays; page with start/limit until a short page.
 * (start/limit honored: measured `?start=0&limit=1` returns 1 row. The over-full-page guard
 * exists so a Strapi upgrade that stops honoring them fails loudly instead of looping forever.)
 */
async function fetchAllFiles(client) {
  const out = [];
  for (let start = 0; ; start += 1000) {
    const page = await client.api(`/upload/files?start=${start}&limit=1000&sort=id:asc`);
    const rows = Array.isArray(page) ? page : page.results ?? [];
    if (rows.length > 1000) throw new Error('/upload/files ignored start/limit — refusing to page blindly');
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/**
 * Map every URL a matched file pair exposes: the original plus each format variant present on
 * both sides. Rich text embeds format URLs too (CKEditor srcset), and staging regenerates
 * formats under its own hash — an unmapped format URL 404s on staging.
 */
function addUrlMappings(lf, sf, fileUrlMap) {
  if (lf.url !== sf.url) fileUrlMap.set(lf.url, sf.url);
  for (const [k, lfmt] of Object.entries(lf.formats ?? {})) {
    const sfmt = sf.formats?.[k];
    if (sfmt && lfmt.url !== sfmt.url) fileUrlMap.set(lfmt.url, sfmt.url);
  }
}

function diffFiles(localFiles, stagingFiles) {
  const byHash = new Map(stagingFiles.map((f) => [f.hash, f]));
  // Name fallback: a REST upload mints a fresh hash on the destination AND staging
  // re-optimizes images (so even the stored size drifts — measured on every re-pushed jpg).
  // Same name + mime, preferring an exact size match, else the oldest candidate: without
  // this tier, previously-pushed files re-upload on every run, forever.
  const byName = new Map();
  for (const f of stagingFiles) {
    if (!byName.has(f.name)) byName.set(f.name, []);
    byName.get(f.name).push(f);
  }
  const newFiles = [], fileIdMap = new Map(), fileUrlMap = new Map();
  const matchedStagingIds = new Set();
  for (const lf of localFiles) {
    let sf = byHash.get(lf.hash);
    if (!sf) {
      const candidates = (byName.get(lf.name) ?? []).filter((f) => f.mime === lf.mime);
      sf = candidates.find((f) => f.size === lf.size)
        ?? (candidates.length ? candidates.reduce((a, b) => (a.id < b.id ? a : b)) : undefined);
      if (sf && candidates.length > 1) {
        console.log(warn(`media "${lf.name}": ${candidates.length} same-name candidates on staging — matched ${sf.size === lf.size ? 'exact size' : 'oldest'} (id ${sf.id})`));
      }
    }
    if (!sf) { newFiles.push(lf); continue; }
    matchedStagingIds.add(sf.id);
    fileIdMap.set(lf.id, sf.id);
    addUrlMappings(lf, sf, fileUrlMap);
  }
  const stagingOnlyFiles = stagingFiles.filter((f) => !matchedStagingIds.has(f.id));
  return { newFiles, fileIdMap, fileUrlMap, stagingOnlyFiles };
}

// ── String rewriting ──────────────────────────────────────────────────────────
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Single-pass rewriter over the documentId + file-URL maps. One alternation regex, longest
 * keys first, replacement via lookup — so a replacement can never be re-matched and chain
 * (A->B then B->C), unlike sequential split/join passes. Rebuilt lazily when the maps grow
 * (each POST adds a documentId mapping mid-run).
 */
function makeRewriter(docIdMap, fileUrlMap) {
  let re = null, table = null, builtSize = -1;
  const currentSize = () => docIdMap.size + fileUrlMap.size;
  const build = () => {
    table = new Map();
    for (const [from, to] of docIdMap) if (from !== to) table.set(from, to);
    for (const [from, to] of fileUrlMap) table.set(from, to);
    const keys = [...table.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
    re = keys.length ? new RegExp(keys.join('|'), 'g') : null;
    builtSize = currentSize();
  };
  return (s) => {
    if (builtSize !== currentSize()) build();
    return re ? s.replace(re, (m) => table.get(m) ?? m) : s;
  };
}

// ── Payload builder ───────────────────────────────────────────────────────────
/** An object that carries an upload-file signature (blocks image nodes embed these whole). */
const looksLikeUploadFile = (v) =>
  v && typeof v === 'object' && !Array.isArray(v) && v.url !== undefined && v.hash !== undefined && v.id !== undefined;

/**
 * Walk arbitrary nested values (json fields, blocks, component bodies): rewrite every string
 * through the docId/URL maps, and remap embedded upload-file objects to their staging ids.
 * Never deletes keys — deep JSON is user data, and an `id` key inside it is not ours to strip.
 */
function deepRewrite(v, rewrite, fileIdMap) {
  if (typeof v === 'string') return rewrite(v);
  if (Array.isArray(v)) return v.map((x) => deepRewrite(x, rewrite, fileIdMap));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = deepRewrite(val, rewrite, fileIdMap);
    if (looksLikeUploadFile(v) && fileIdMap.has(v.id)) out.id = fileIdMap.get(v.id);
    return out;
  }
  return v;
}

/**
 * Component instances: strip Strapi's own `id`/`documentId` at the INSTANCE level only (so
 * the destination re-creates them), keep `__component` for dynamic zones, and deep-rewrite
 * the attribute values without stripping anything inside them.
 */
function componentPayload(v, rewrite, fileIdMap) {
  if (Array.isArray(v)) return v.map((x) => componentPayload(x, rewrite, fileIdMap));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === 'id' || k === 'documentId' || k === '__temp_key__') continue;
      out[k] = deepRewrite(val, rewrite, fileIdMap);
    }
    return out;
  }
  return v;
}

/**
 * Throws on any unmappable media so a broken reference never reaches staging.
 *
 * A relation whose target is being CREATED later in this same run (self-references like
 * site.parent_site, or any fetch-order accident) cannot be mapped yet — such fields are
 * omitted from the payload and returned in `deferred`; main() re-PUTs them once every
 * creation has a staging documentId.
 */
function buildPayload(model, entity, { docIdMap, fileIdMap, pendingCreation }, rewrite) {
  const problems = [];
  const deferred = [];
  const data = {};
  for (const key of model.scalars) {
    const v = entity[key];
    if (v === undefined) continue;
    // Non-string scalars include `json` and `blocks` values — deep structures that can embed
    // media URLs and whole upload-file objects (blocks image nodes), so they get the same
    // rewrite treatment as strings.
    data[key] = typeof v === 'string' ? rewrite(v)
      : v && typeof v === 'object' ? deepRewrite(v, rewrite, fileIdMap)
      : v;
  }
  for (const key of model.media) {
    const v = entity[key];
    if (v === undefined || v === null) { data[key] = null; continue; }
    const mapOne = (f) => {
      const id = fileIdMap.get(f.id);
      if (!id) problems.push(`media "${f.name}" (${key}) has no staging counterpart`);
      return id;
    };
    data[key] = Array.isArray(v) ? v.map(mapOne).filter(Boolean) : mapOne(v);
  }
  for (const key of model.writeRelations) {
    const v = entity[key];
    if (v === undefined) continue;
    const targets = v === null ? [] : Array.isArray(v) ? v : [v];
    if (targets.some((r) => !docIdMap.has(r.documentId) && pendingCreation.has(r.documentId))) {
      deferred.push({ key, value: v });
      continue;
    }
    // An id missing from the map passes through unchanged: correct for entities untouched
    // since the last full transfer (same documentId on both sides); a truly absent target
    // 400s loudly on write.
    const mapOne = (r) => docIdMap.get(r.documentId) ?? r.documentId;
    data[key] = v === null ? null : Array.isArray(v) ? v.map(mapOne) : mapOne(v);
  }
  for (const key of model.components) {
    const v = entity[key];
    if (v === undefined) continue;
    data[key] = componentPayload(v, rewrite, fileIdMap);
  }
  if (problems.length) throw new Error(`${model.plural}: ${problems.join('; ')}`);
  return { data, deferred };
}

// ── Writes ────────────────────────────────────────────────────────────────────
/**
 * Single attempt on writes: retrying a POST that half-landed would double-create.
 * Requests go through the local CF Access proxy (staging.root), which injects the CF headers.
 * A non-JSON 2xx throws (except an empty DELETE response): a Cloudflare login page served
 * mid-run must fail loudly, not read as success — same hardening as lib/strapi.mjs api().
 */
async function write(staging, method, path, body) {
  const res = await fetch(`${staging.root}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.STAGING_STRAPI_TOKEN}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`staging ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  if (method === 'DELETE' && (res.status === 204 || text.length === 0)) return null;
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json')) {
    throw new Error(`staging ${method} ${path}: expected JSON, got ${ct || 'no content-type'} — ${text.slice(0, 120)}`);
  }
  return JSON.parse(text);
}

async function uploadNewFile(staging, lf) {
  // upload.file urls are usually root-relative, but provider-hosted files legitimately carry
  // absolute URLs (documented in backend/src/index.ts) — don't prefix those.
  const src = /^https?:/i.test(lf.url) ? lf.url : `${LOCAL_URL}${lf.url}`;
  const buf = await getBuffer(src, { label: `download ${lf.name}` });
  const form = new FormData();
  form.append('files', new Blob([buf], { type: lf.mime }), lf.name);
  form.append('fileInfo', JSON.stringify({
    name: lf.name,
    alternativeText: lf.alternativeText ?? null,
    caption: lf.caption ?? null,
  }));
  const res = await fetch(`${staging.root}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STAGING_STRAPI_TOKEN}` },
    body: form,
  });
  if (!res.ok) throw new Error(`upload ${lf.name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const [file] = await res.json();
  return file;
}

/** Run thunks with bounded concurrency, preserving input order in the result. */
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * The push writes the draft state and relies on this backend auto-publishing REST writes.
 * That is an observation, not a contract — so after every write, confirm the published
 * version actually exists on staging and warn when it doesn't. (There is no REST unpublish,
 * so a local unpublish can only be mirrored manually — warned at push time.)
 */
async function verifyPublished(staging, plural, stagingDocId, key) {
  try {
    const pub = await staging.findOne(plural, `filters[documentId][$eq]=${stagingDocId}&fields[0]=updatedAt`);
    if (!pub) console.log(warn(`${plural}/${key}: no PUBLISHED version on staging — publish it in the staging admin`));
  } catch (e) {
    console.log(warn(`${plural}/${key}: could not verify publish state (${e.message.slice(0, 80)})`));
  }
}

async function confirm(summaryLines) {
  if (YES) return true;
  if (!process.stdin.isTTY) {
    console.log('\nRefusing to --apply: no TTY for confirmation. Pass --yes to run non-interactively.');
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nAbout to write to STAGING:\n${summaryLines}\nType PUSH to continue: `);
  rl.close();
  return answer.trim() === 'PUSH';
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`── push-changed-content ${APPLY ? '(APPLY)' : '(dry run)'} ─────────────────`);

  // Preflight
  const host = new URL(STAGING_URL).host;
  if (!ALLOWED_DESTINATIONS.includes(host)) {
    console.log(bad(`destination ${host} is not allowlisted (${ALLOWED_DESTINATIONS.join(', ')})`)); process.exit(1);
  }
  if (!process.env.STRAPI_TOKEN) { console.log(bad('STRAPI_TOKEN missing (scripts/.env)')); process.exit(1); }
  if (!process.env.STAGING_STRAPI_TOKEN) {
    console.log(bad('STAGING_STRAPI_TOKEN missing — mint a FULL ACCESS API token in staging admin → Settings → API Tokens, put it in scripts/.env. (The transfer token cannot serve REST.)'));
    process.exit(1);
  }
  if (!CF_ID || !CF_SECRET) { console.log(bad('CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET missing')); process.exit(1); }
  assertNoComponentMedia();

  const schemas = loadSchemas();
  // A schema outside PUSH_ORDER would be silently skipped forever — refuse instead.
  const unordered = [...schemas.keys()].filter((c) => !PUSH_ORDER.includes(c));
  if (unordered.length) {
    console.log(bad(`collections missing from PUSH_ORDER: ${unordered.join(', ')} — add them (with a natural key if they have no slug)`));
    process.exit(1);
  }
  const unknownOnly = ONLY.filter((c) => !schemas.has(c));
  if (unknownOnly.length) {
    console.log(bad(`--only names unknown collections: ${unknownOnly.join(', ')}`));
    process.exit(1);
  }
  // ALL collections are always diffed — the documentId map must be complete even for
  // collections that won't be pushed, or --only articles would leave local widget ids
  // unrewritten in the HTML (silently broken widgets on staging). --only restricts only
  // what gets WRITTEN.
  const collections = [...PUSH_ORDER];
  const pushSet = new Set(ONLY.length ? ONLY : PUSH_ORDER);

  const proxy = await startCfAccessProxy({
    target: STAGING_URL, clientId: CF_ID, clientSecret: CF_SECRET, port: PORT, quiet: true,
  });
  const local = createClient({ baseUrl: LOCAL_URL, token: process.env.STRAPI_TOKEN, label: 'local' });
  const staging = createClient({ baseUrl: proxy.url, token: process.env.STAGING_STRAPI_TOKEN, label: 'staging' });

  try {
    const health = await staging.raw('/_health');
    if (health.status !== 204) throw new Error(`/_health ${health.status}`);
    console.log(ok(`staging reachable through the CF Access proxy`));

    // Multi-locale guard: these REST reads return only the default locale, so a second locale
    // would be invisible to the diff and silently never push. The full transfer handles locales.
    const locales = await local.api('/i18n/locales');
    if (Array.isArray(locales) && locales.length > 1) {
      console.log(bad(`${locales.length} locales exist (${locales.map((l) => l.code).join(', ')}) — this script diffs the default locale only; use sync-content-to-staging.mjs`));
      process.exit(1);
    }

    // Phase 1 — diff (collections in parallel; PUSH_ORDER only matters for writes)
    console.log('\n── Diff (by natural key; changed = local updatedAt strictly newer) ──');
    const diffResults = await Promise.all(collections.map((p) => diffCollection(local, staging, p, schemas.get(p).draftAndPublish)));
    const diffs = new Map(diffResults.map((d) => [d.plural, d]));
    const docIdMap = new Map();
    for (const d of diffResults) for (const [k, v] of d.docIdMap) docIdMap.set(k, v);
    for (const plural of collections) {
      const d = diffs.get(plural);
      const show = (list) => list.slice(0, 6).map((x) => x.key).join(', ') + (list.length > 6 ? ` … +${list.length - 6}` : '');
      console.log(
        `  ${plural.padEnd(12)} new ${String(d.created.length).padStart(3)}${d.created.length ? `: ${show(d.created)}` : ''}` +
        `${d.changed.length ? `\n  ${''.padEnd(12)} chg ${String(d.changed.length).padStart(3)}: ${show(d.changed)}` : ''}` +
        `${d.stagingOnly.length ? `\n  ${''.padEnd(12)} ${PRUNE ? 'DEL' : 'only-on-staging'} ${String(d.stagingOnly.length).padStart(3)}: ${show(d.stagingOnly)}` : ''}`,
      );
    }

    const [localFiles, stagingFiles] = await Promise.all([fetchAllFiles(local), fetchAllFiles(staging)]);
    const { newFiles, fileIdMap, fileUrlMap, stagingOnlyFiles } = diffFiles(localFiles, stagingFiles);
    const newMb = (newFiles.reduce((n, f) => n + (f.size ?? 0), 0) / 1024).toFixed(1);
    console.log(`\n  media: ${localFiles.length} local, ${stagingFiles.length} staging — ` +
      `${newFiles.length} new to upload (~${newMb} MB), ${fileIdMap.size} already on staging (skipped)`);
    for (const f of newFiles.slice(0, 12)) console.log(`    + ${f.name} (${f.size} KB)`);
    if (newFiles.length > 12) console.log(`    … +${newFiles.length - 12} more`);
    if (stagingOnlyFiles.length) {
      console.log(warn(`${stagingOnlyFiles.length} staging-only file(s) (never deleted by this script): ` +
        stagingOnlyFiles.slice(0, 5).map((f) => f.name).join(', ') + (stagingOnlyFiles.length > 5 ? ' …' : '')));
    }

    const pushed = collections.filter((c) => pushSet.has(c));
    if (pushed.length < collections.length) {
      console.log(`\n  --only: writing ${pushed.join(', ')} — everything else was diffed for the id maps only`);
    }
    const totalNew = pushed.reduce((n, c) => n + diffs.get(c).created.length, 0);
    const totalChg = pushed.reduce((n, c) => n + diffs.get(c).changed.length, 0);
    const totalDel = PRUNE ? pushed.reduce((n, c) => n + diffs.get(c).stagingOnly.length, 0) : 0;

    if (totalNew + totalChg + newFiles.length + totalDel === 0) {
      console.log(`\nNothing to push — staging is up to date.${APPLY ? '' : ' No report written.'}`);
      return;
    }

    // ── Approval report: field-level diffs for every changed entry, written to disk so the
    // push can be reviewed and approved before any --apply. The full local entities fetched
    // here double as the payload sources in phase 3 (no refetch).
    const fieldDiffs = new Map();
    const fullCache = new Map(); // local documentId -> full local entity
    for (const plural of pushed) {
      const model = schemas.get(plural);
      const { changed } = diffs.get(plural);
      const pairs = await pool(changed, 5, async ({ key, local: le, staging: se }) => {
        const [lf, sf] = await Promise.all([
          local.api(`/${plural}/${le.documentId}?populate=*&status=draft`).then((r) => r.data),
          staging.api(`/${plural}/${se.documentId}?populate=*&status=draft`).then((r) => r.data),
        ]);
        return { key, lf, sf, localDocId: le.documentId };
      });
      for (const { key, lf, sf, localDocId } of pairs) {
        fullCache.set(localDocId, lf);
        fieldDiffs.set(`${plural}:${key}`, diffEntityFields(model, lf, sf));
      }
    }
    const report = renderReport({ pushed, diffs, fieldDiffs, newFiles, stagingOnlyFiles, prune: PRUNE });
    const reportDir = join(__dirname, 'data', 'push-reports');
    mkdirSync(reportDir, { recursive: true });
    const reportPath = join(reportDir, `push-report-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.md`);
    writeFileSync(reportPath, report);
    console.log(`\n  Report written: ${reportPath.replace(REPO + '/', '')}`);

    if (!APPLY) {
      console.log(`\nDry run: ${totalNew} to create, ${totalChg} to update, ${newFiles.length} files to upload` +
        `${totalDel ? `, ${totalDel} to delete` : ''}. Review the report, then re-run with --apply.`);
      return;
    }
    if (!(await confirm(`  create ${totalNew}, update ${totalChg}, upload ${newFiles.length} file(s)${totalDel ? `, DELETE ${totalDel}` : ''}\n  Full report: ${reportPath}`))) {
      console.log('Aborted.'); process.exitCode = 1; return;
    }

    // Phase 2 — upload new files (independent of each other; bounded concurrency)
    if (newFiles.length) console.log('\n── Uploading new files ──');
    await pool(newFiles, 5, async (lf) => {
      const sf = await uploadNewFile(staging, lf);
      fileIdMap.set(lf.id, sf.id);
      addUrlMappings(lf, sf, fileUrlMap);
      console.log(`  ↑ ${lf.name} -> staging id ${sf.id}`);
    });

    // Phase 3 — entities, in dependency order. Writes stay sequential (ordering is the point);
    // the full-entity reads are prefetched per collection so they don't serialize behind writes.
    console.log('\n── Pushing entities ──');
    // Local docIds that will only get a staging counterpart during this run: a relation
    // pointing at one of these can't be mapped yet (self-references like site.parent_site,
    // or unlucky fetch order) — buildPayload defers those fields and they're re-PUT below.
    const pendingCreation = new Set(
      pushed.flatMap((c) => diffs.get(c).created.map((x) => x.local.documentId)),
    );
    const maps = { docIdMap, fileIdMap, pendingCreation };
    const rewrite = makeRewriter(docIdMap, fileUrlMap);
    const fixups = []; // { plural, key, localDocId, publish, fields: {field: originalValue} }
    // Writes carry ?status=published for locally-published entities: the repo has measured
    // both behaviors (POST auto-publishes; PUT updates the draft only — generate-faqs.mjs vs
    // generate-toplists.mjs), so relying on either is wrong. status=published writes both
    // versions (the established pattern in seed-info-pages.mjs). Locally-unpublished entities
    // are written WITHOUT it and stay draft on staging.
    // `published` comes from the diff's published-version set — NOT from full.publishedAt,
    // which is always null on a status=draft fetch of a draft&publish type (measured).
    const statusFor = (model, published) => (model.draftAndPublish && published ? '?status=published' : '');
    for (const plural of pushed) {
      const model = schemas.get(plural);
      const d = diffs.get(plural);
      const work = [...d.created, ...d.changed];
      // Changed entities were already fetched for the report; only creations need a read.
      const fulls = await pool(work, 5, async ({ local: le }) =>
        fullCache.get(le.documentId) ??
        (await local.api(`/${plural}/${le.documentId}?populate=*&status=draft`)).data);
      for (const [i, { key, local: le, staging: se, published }] of work.entries()) {
        const full = fulls[i];
        if (model.draftAndPublish && !published) {
          console.log(warn(`${plural}/${key}: unpublished locally — pushed as a DRAFT on staging`));
        }
        const { data, deferred } = buildPayload(model, full, maps, rewrite);
        if (deferred.length) {
          fixups.push({
            plural, key, localDocId: le.documentId, publish: Boolean(model.draftAndPublish && published),
            fields: Object.fromEntries(deferred.map(({ key: f, value }) => [f, value])),
          });
        }
        if (se) {
          await write(staging, 'PUT', `/${plural}/${docIdMap.get(le.documentId)}${statusFor(model, published)}`, { data });
          console.log(`  ✎ ${plural}/${key} updated`);
        } else {
          const created = (await write(staging, 'POST', `/${plural}${statusFor(model, published)}`, { data })).data;
          docIdMap.set(le.documentId, created.documentId);
          console.log(`  + ${plural}/${key} created (${created.documentId})`);
        }
        if (model.draftAndPublish && published) await verifyPublished(staging, plural, docIdMap.get(le.documentId), key);
      }
    }

    // Deferred relation fields: every creation now has a staging documentId, so remap and PUT.
    for (const f of fixups) {
      const mapOne = (r) => docIdMap.get(r.documentId) ?? r.documentId;
      const data = Object.fromEntries(Object.entries(f.fields).map(([field, v]) => [
        field, v === null ? null : Array.isArray(v) ? v.map(mapOne) : mapOne(v),
      ]));
      await write(staging, 'PUT', `/${f.plural}/${docIdMap.get(f.localDocId)}${f.publish ? '?status=published' : ''}`, { data });
      console.log(`  ✎ ${f.plural}/${f.key}: deferred relation(s) linked (${Object.keys(f.fields).join(', ')})`);
    }

    // Prune AFTER all pushes, children before parents (reverse dependency order) — deleting a
    // site before its offers would race restrictive lifecycles/constraints.
    if (PRUNE && totalDel) {
      console.log('\n── Pruning staging-only entries ──');
      for (const plural of [...pushed].reverse()) {
        for (const { key, staging: se } of diffs.get(plural).stagingOnly) {
          await write(staging, 'DELETE', `/${plural}/${se.documentId}`);
          console.log(`  ✖ ${plural}/${key} deleted`);
        }
      }
    }

    // Phase 4 — verify: re-diff ONLY the touched collections (untouched ones cannot have
    // drifted from a run that didn't write to them), in parallel.
    console.log('\n── Verify ──');
    const touched = pushed.filter((c) => {
      const d = diffs.get(c);
      return d.created.length + d.changed.length + (PRUNE ? d.stagingOnly.length : 0) > 0;
    });
    const reDiffs = await Promise.all(touched.map((p) => diffCollection(local, staging, p, schemas.get(p).draftAndPublish)));
    let leftovers = 0;
    for (const d of reDiffs) {
      const n = d.created.length + d.changed.length + (PRUNE ? d.stagingOnly.length : 0);
      if (n) { leftovers += n; console.log(bad(`${d.plural}: ${d.created.length} new / ${d.changed.length} changed still differ`)); }
    }
    console.log(leftovers ? bad(`${leftovers} entr(ies) still differ`) : ok(`diff is clean for the ${touched.length} touched collection(s)`));
    console.log('\nSpot-check the staging frontend for the touched content (draft-vs-published and rendered widgets are not provable from here).');
    if (leftovers) process.exitCode = 1;
  } finally {
    if (!KEEP_PROXY) proxy.close();
    else console.log(`\nProxy left running at ${proxy.url}`);
  }
}

main().catch((err) => { console.error(`\nFAILED: ${err.message}`); process.exit(1); });
