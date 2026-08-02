/**
 * Shared Strapi client for the scripts.
 *
 * Used by NEW scripts only for now (the archive importer, verify). The three existing
 * generators carry their own copy-pasted versions of most of this; they get ported one at a
 * time behind a `--dry-run` golden-output diff, not in the same week we run 47 articles.
 */

import { createRequire } from 'module';
import { openAsBlob } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const _require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
_require('dotenv').config({ path: `${__dirname}/../.env`, quiet: true });

import { withRetry } from './http.mjs';

export const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
export const TOKEN = process.env.STRAPI_TOKEN;

export function requireToken() {
  if (!TOKEN) {
    console.error('Error: STRAPI_TOKEN is required (scripts/.env).');
    process.exit(1);
  }
}

const jsonHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` });

/** GET one Strapi page, retried. Throws on a non-OK final status. */
export async function api(path, init = {}) {
  const res = await withRetry(
    () => fetch(`${STRAPI_URL}/api${path}`, { headers: jsonHeaders(), ...init }),
    { label: `strapi ${path.split('?')[0]}` },
  );
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/**
 * Fetch every page of a collection.
 *
 * `status=draft` is the Strapi 5 way to get the draft version of EVERY document, published or
 * not — i.e. the complete set. (`publicationState=preview` was the v4 name and is silently
 * ignored on v5, which quietly returns published-only.)
 */
export async function fetchAll(collection, query = '', { pageSize = 100 } = {}) {
  const out = [];
  for (let page = 1; ; page += 1) {
    const json = await api(`/${collection}?${query}&pagination[page]=${page}&pagination[pageSize]=${pageSize}`);
    out.push(...json.data);
    if (page >= (json.meta?.pagination?.pageCount ?? 1)) break;
  }
  return out;
}

export async function findOne(collection, query) {
  const json = await api(`/${collection}?${query}&pagination[pageSize]=1`);
  return json.data?.[0] ?? null;
}

/** All articles as `{ slug, id, documentId, postId, publishDate }`, keyed by slug. */
export async function articlesBySlug() {
  const rows = await fetchAll(
    'articles',
    'fields[0]=slug&fields[1]=postId&fields[2]=publishDate&fields[3]=modifiedDate&status=draft',
  );
  return new Map(rows.map((a) => [a.slug, a]));
}

/** Active sites keyed by slug AND by lowercased name — both are used to resolve references. */
export async function siteIndex() {
  const rows = await fetchAll('sites', 'fields[0]=name&fields[1]=slug&fields[2]=isActive');
  const bySlug = new Map(), byName = new Map();
  for (const s of rows) {
    bySlug.set(s.slug, s);
    byName.set(s.name.trim().toLowerCase(), s);
  }
  return { rows, bySlug, byName };
}

export async function createArticle(data) {
  const res = await withRetry(
    () => fetch(`${STRAPI_URL}/api/articles`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ data }) }),
    { label: `create ${data.slug}` },
  );
  if (!res.ok) throw new Error(`create ${data.slug}: ${res.status} ${(await res.text()).slice(0, 400)}`);
  return (await res.json()).data;
}

/**
 * Update in place.
 *
 * Deliberately a PUT, never delete+create: recreating reassigns both `documentId` and the
 * numeric id that widgets embed, opens a 404 window on an already-indexed URL, and resets
 * `publishedAt`, which orders /blog.
 */
export async function updateArticle(documentId, data) {
  const res = await withRetry(
    () => fetch(`${STRAPI_URL}/api/articles/${documentId}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ data }) }),
    { label: `update ${documentId}` },
  );
  if (!res.ok) throw new Error(`update ${documentId}: ${res.status} ${(await res.text()).slice(0, 400)}`);
  return (await res.json()).data;
}

/**
 * Upload a local file, streaming via openAsBlob so multi-MB media is never buffered.
 *
 * Validates the mime here: Strapi's `allowedTypes` is enforced only by the admin media
 * picker, NOT by the REST API — a video POSTs happily into an images-only field (measured),
 * and nothing downstream would catch it.
 */
export async function uploadLocalFile(path, filename, type, expectPrefix) {
  if (expectPrefix && !type.startsWith(expectPrefix)) {
    throw new Error(`${filename}: expected ${expectPrefix}* but got ${type}`);
  }
  const res = await withRetry(async () => {
    const form = new FormData();
    form.append('files', await openAsBlob(path, { type }), filename);
    // No Content-Type header: FormData sets it with the multipart boundary.
    return fetch(`${STRAPI_URL}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: form,
    });
  }, { label: `upload ${filename}` });
  if (!res.ok) throw new Error(`upload ${filename}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const [file] = await res.json();
  // width/height come back for images and feed the <img> attributes that prevent CLS.
  return file ? { id: file.id, url: file.url, width: file.width ?? null, height: file.height ?? null } : null;
}
