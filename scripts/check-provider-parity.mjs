#!/usr/bin/env node
/**
 * check-provider-parity.mjs — the provider kernel's integrity check.
 *
 * Provider knowledge lives in ONE place per runtime (each frontend provider's meta.ts
 * and backend/src/api/cam-model/providers.json) because the two cannot share a module: the
 * Docker build contexts are per-service. This script is what stops them drifting, plus the two
 * Strapi schema enums (which must be literal — Strapi reads schema.json statically).
 *
 * Asserts:
 *   1. the same provider ids on both sides, and in providers/ids.ts
 *   2. matching slugs and photo/thumb hosts per provider
 *   3. cam-model.provider and cam-category.providerKey enums list exactly those ids
 *   4. every id has a frontend video plugin entry (else the build would fail anyway, but a
 *      clear message here beats a type error)
 *
 * Usage: node scripts/check-provider-parity.mjs   (exit 1 on any mismatch)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(REPO, p), 'utf-8');
const problems = [];
const fail = (m) => problems.push(m);

/** Pull string-literal fields out of a TS meta file without importing TS. */
function parseMeta(src, file) {
  const pick = (key) => src.match(new RegExp(`\\b${key}:\\s*'([^']*)'`))?.[1] ?? null;
  const pickBool = (key) => {
    const m = src.match(new RegExp(`\\b${key}:\\s*(true|false)`));
    return m ? m[1] === 'true' : null;
  };
  const pickList = (key) => {
    const raw = src.match(new RegExp(`\\b${key}:\\s*\\[([^\\]]*)\\]`, 's'))?.[1] ?? '';
    return [...raw.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };
  const id = pick('id');
  if (!id) fail(`${file}: could not parse an \`id\``);
  return {
    id,
    slug: pick('slug'),
    name: pick('name'),
    thumbHosts: pickList('thumbHosts'),
    hasProfilePortrait: pickBool('hasProfilePortrait'),
    liveSnapshots: pickBool('liveSnapshots'),
    lemoncamsSlug: pick('lemoncamsSlug'),
  };
}

// ── Frontend side ────────────────────────────────────────────────────────────────
const idsSrc = read('frontend/src/lib/cams/providers/ids.ts');
const frontendIds = [...(idsSrc.match(/CAM_PROVIDER_IDS\s*=\s*\[([^\]]*)\]/s)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (frontendIds.length === 0) fail('providers/ids.ts: could not parse CAM_PROVIDER_IDS');

const metaRegistry = read('frontend/src/lib/cams/providers/meta.ts');
const metaDirs = [...metaRegistry.matchAll(/from '\.\/([\w-]+)\/meta'/g)].map((m) => m[1]);
const frontendMeta = new Map();
for (const dir of metaDirs) {
  const file = `frontend/src/lib/cams/providers/${dir}/meta.ts`;
  const meta = parseMeta(read(file), file);
  if (meta.id) frontendMeta.set(meta.id, { ...meta, dir });
}

const videoSrc = read('frontend/src/lib/cams/providers/video.ts');

// ── Backend side ─────────────────────────────────────────────────────────────────
const backend = JSON.parse(read('backend/src/api/cam-model/providers.json')).providers;
const backendIds = Object.keys(backend);

// ── 1 + 4: id sets agree, and each id is fully wired ─────────────────────────────
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
if (!sameSet(frontendIds, backendIds)) {
  fail(`id mismatch: providers/ids.ts [${frontendIds}] vs backend providers.json [${backendIds}]`);
}
for (const id of frontendIds) {
  if (!frontendMeta.has(id)) fail(`provider "${id}" has no frontend meta.ts registered in providers/meta.ts`);
  if (!new RegExp(`^\\s*${id}:\\s*\\{`, 'm').test(videoSrc)) {
    fail(`provider "${id}" has no entry in providers/video.ts (VIDEO_PLUGINS)`);
  }
}

// ── 2: per-provider facts agree ──────────────────────────────────────────────────
for (const id of frontendIds.filter((i) => backend[i] && frontendMeta.has(i))) {
  const f = frontendMeta.get(id);
  const b = backend[id];
  if (f.slug !== b.slug) fail(`${id}: slug "${f.slug}" (frontend) vs "${b.slug}" (backend)`);
  if (!sameSet(f.thumbHosts, b.photoHosts)) {
    fail(`${id}: hosts [${f.thumbHosts}] (frontend thumbHosts) vs [${b.photoHosts}] (backend photoHosts)`);
  }
  if (f.hasProfilePortrait !== b.hasProfilePortrait) fail(`${id}: hasProfilePortrait disagrees`);
  if (f.liveSnapshots !== b.liveSnapshots) fail(`${id}: liveSnapshots disagrees`);
  if (f.lemoncamsSlug !== b.lemoncamsSlug) fail(`${id}: lemoncamsSlug disagrees`);
}

// ── 3: the two Strapi enums (literal by necessity) ───────────────────────────────
const enums = [
  ['cam-model.provider', 'backend/src/api/cam-model/content-types/cam-model/schema.json', 'provider'],
  ['cam-category.providerKey', 'backend/src/api/cam-category/content-types/cam-category/schema.json', 'providerKey'],
];
for (const [label, file, attr] of enums) {
  const list = JSON.parse(read(file)).attributes?.[attr]?.enum;
  if (!Array.isArray(list)) fail(`${label}: no enum found in ${file}`);
  else if (!sameSet(list, backendIds)) fail(`${label}: enum [${list}] should be [${backendIds}]`);
}

// ── Report ───────────────────────────────────────────────────────────────────────
if (problems.length) {
  console.error('provider parity FAILED:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`provider parity OK — ${frontendIds.length} provider(s): ${frontendIds.join(', ')}`);
console.log('  frontend meta + video plugins, backend providers.json, and both Strapi enums agree.');
