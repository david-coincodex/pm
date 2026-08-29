import { factories } from '@strapi/strapi';
import { createHash } from 'node:crypto';
import { CAM_MODEL_UID as UID, LAST_SEEN_SLACK_MS } from '../constants';

/** Batch size for $in lookups — a politeness bound, not a driver limit (modern better-sqlite3
 * binds up to 32,766 variables; Postgres far more). */
const KEY_CHUNK = 500;
/** Sanity ceiling on the posted roster. Feeds deliver ~3-6k live models; reject only clearly
 * broken payloads — a too-low ceiling would 400 every sync FOREVER and silently freeze the
 * registry the day the feeds grow. */
const MAX_ROSTER = 20_000;
/** Hard cap per keys() page — the sitemap's chunk size; anything above just wastes memory. */
const KEYS_PAGE_LIMIT = 20_000;

const PROVIDERS = new Set(['cb', 'bc']);
const GENDERS = new Set(['f', 'm', 'c', 't']);

interface IncomingModel {
  key: string;
  provider: 'cb' | 'bc';
  username: string;
  displayName: string;
  gender: string | null;
  country: string | null;
  languages: string[];
  tags: string[];
  viewers: number;
  profileImageUrl: string | null;
  thumbUrl: string | null;
}

/** Constant-time secret comparison without leaking length; unset env always fails. */
function secretMatches(header: unknown): boolean {
  const expected = process.env.CAM_SYNC_SECRET;
  if (!expected || typeof header !== 'string') return false;
  const a = createHash('sha256').update(header).digest();
  const b = createHash('sha256').update(expected).digest();
  return a.equals(b);
}

function sanitize(raw: unknown): IncomingModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const provider = String(m.provider ?? '');
  const username = String(m.username ?? '').slice(0, 60);
  // Same charset the frontend's cleanCamUsername allows; anything else would also end up
  // interpolated into thumb URLs by the capture cron.
  if (!PROVIDERS.has(provider) || !/^[\w.-]+$/.test(username)) return null;
  const gender = String(m.gender ?? '');
  const list = (v: unknown) =>
    Array.isArray(v) ? v.slice(0, 20).map((x) => String(x).slice(0, 50)) : [];
  return {
    key: `${provider}:${username}`,
    provider: provider as 'cb' | 'bc',
    username,
    displayName: (String(m.displayName ?? '').slice(0, 100) || username),
    gender: GENDERS.has(gender) ? gender : null,
    country: m.country ? String(m.country).slice(0, 8).toLowerCase() : null,
    languages: list(m.languages),
    tags: list(m.tags),
    viewers: Math.max(0, Math.floor(Number(m.viewers) || 0)),
    profileImageUrl: m.profileImageUrl ? String(m.profileImageUrl).slice(0, 500) : null,
    thumbUrl: m.thumbUrl ? String(m.thumbUrl).slice(0, 500) : null,
  };
}

interface ExistingRow {
  id: number;
  key: string;
  lastSeenAt: string | Date | null;
  peakViewers: number | null;
  displayName: string | null;
  gender: string | null;
  country: string | null;
  profileImageUrl: string | null;
}

export default factories.createCoreController(UID, ({ strapi }) => ({
  /**
   * Feed-roster upsert, called by the frontend every ~5 minutes with every model currently
   * live. Deliberately strapi.db.query, NOT strapi.documents(): the documents service has no
   * bulk operations, each write would run the normalizeMediaUrls middleware walk, and each
   * would emit webhooks — hundreds of revalidate calls per sync. Raw db writes need
   * publishedAt set explicitly (the db layer never sets it; documentId and timestamps are
   * automatic).
   */
  async sync(ctx) {
    if (!secretMatches(ctx.request.headers['x-cam-sync-secret'])) return ctx.unauthorized();

    const body = ctx.request.body as { models?: unknown[] } | undefined;
    if (!Array.isArray(body?.models)) return ctx.badRequest('models array is required');
    if (body.models.length > MAX_ROSTER) return ctx.badRequest('roster too large');

    // Sanitize + dedupe by key (feeds occasionally repeat a model across pages).
    const roster = new Map<string, IncomingModel>();
    for (const raw of body.models) {
      const m = sanitize(raw);
      if (m) roster.set(m.key, m);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const q = strapi.db.query(UID);
    const keys = [...roster.keys()];

    const existing = new Map<string, ExistingRow>();
    for (let i = 0; i < keys.length; i += KEY_CHUNK) {
      const rows: ExistingRow[] = await q.findMany({
        where: { key: { $in: keys.slice(i, i + KEY_CHUNK) } },
        select: ['id', 'key', 'lastSeenAt', 'peakViewers', 'displayName', 'gender', 'country', 'profileImageUrl'],
      });
      for (const row of rows) existing.set(row.key, row);
    }

    let created = 0;
    let updated = 0;
    for (const m of roster.values()) {
      const row = existing.get(m.key);
      if (!row) {
        try {
          await q.create({
            data: {
              key: m.key,
              provider: m.provider,
              username: m.username,
              displayName: m.displayName,
              gender: m.gender,
              country: m.country,
              languages: m.languages,
              tags: m.tags,
              firstSeenAt: nowIso,
              lastSeenAt: nowIso,
              peakViewers: m.viewers,
              profileImageUrl: m.profileImageUrl,
              thumbUrl: m.thumbUrl,
              publishedAt: nowIso,
            },
          });
          created += 1;
        } catch (err) {
          // Unique-key loss against an overlapping sync (retry, second replica, a first run
          // longer than the cadence) — the other writer won; next sync updates the row.
          strapi.log.warn(`[cam-model] create raced for ${m.key}: ${String(err)}`);
        }
        continue;
      }

      const lastSeenMs = row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0;
      const stale = now.getTime() - lastSeenMs > LAST_SEEN_SLACK_MS;
      const peakBeaten = m.viewers > (row.peakViewers ?? 0);
      const identityChanged =
        m.displayName !== row.displayName ||
        m.gender !== (row.gender ?? null) ||
        m.country !== (row.country ?? null) ||
        m.profileImageUrl !== (row.profileImageUrl ?? null);
      if (!stale && !peakBeaten && !identityChanged) continue;

      await q.update({
        where: { id: row.id },
        data: {
          displayName: m.displayName,
          gender: m.gender,
          country: m.country,
          languages: m.languages,
          tags: m.tags,
          lastSeenAt: nowIso,
          peakViewers: Math.max(m.viewers, row.peakViewers ?? 0),
          profileImageUrl: m.profileImageUrl,
          thumbUrl: m.thumbUrl,
        },
      });
      updated += 1;
    }

    return { created, updated, skipped: roster.size - created - updated };
  },

  /**
   * Sitemap enumeration, PAGED — the core find is clamped at 100/page, but the registry is
   * far too big for one response the other way: measured 35k rows / 4.7MB JSON after a single
   * day of syncing (~33k newly-seen models per day of churn), so at 60-day retention this is
   * hundreds of thousands of rows. Each page maps 1:1 onto a models-sitemap.xml chunk.
   * Insertion order keeps a model's chunk fixed between crawler fetches (new models append
   * to the tail); `total` lets the sitemap index compute the chunk count.
   */
  async keys(ctx) {
    const page = Math.max(1, Math.floor(Number(ctx.query.page) || 1));
    const limit = Math.min(KEYS_PAGE_LIMIT, Math.max(1, Math.floor(Number(ctx.query.limit) || KEYS_PAGE_LIMIT)));
    const q = strapi.db.query(UID);
    const [rows, total] = await Promise.all([
      q.findMany({
        select: ['key', 'provider', 'username', 'lastSeenAt', 'updatedAt'],
        orderBy: { id: 'asc' },
        limit,
        offset: (page - 1) * limit,
      }),
      q.count({}),
    ]);
    return { data: rows, total };
  },
}));
