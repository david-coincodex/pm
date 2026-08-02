import { getSitesByKeys, getArticlesByKeys, getCommercialsByIds, Site, Article, Commercial } from '@/lib/strapi';

export type WidgetData = Map<string, unknown>;

interface WidgetType {
  /** Regex to extract keys from HTML (e.g. slugs or IDs). Each match group 1 = key. */
  pattern: RegExp;
  /** Batch fetch all needed data for these keys. */
  prefetch: (keys: string[], locale: string) => Promise<Map<string, unknown>>;
}

/**
 * Widget id patterns accept `documentId` as well as a numeric id.
 *
 * `site`, `article` and `commercial` are all draft-and-publish, and republishing a document
 * reassigns its published row's numeric id — so a widget keyed on a number silently renders
 * empty after any later republish. New content is generated with documentIds; the numeric form
 * stays matched so article bodies already in the database keep working.
 */
const ID_PATTERN = '([a-z0-9]+)';

export const widgetTypes: Record<string, WidgetType> = {
  'site-card': {
    pattern: new RegExp(`data-component="site-card"\\s+data-site-id="${ID_PATTERN}"`, 'g'),
    prefetch(ids: string[]): Promise<Map<string, Site>> {
      return getSitesByKeys(ids);
    },
  },
  'article-card': {
    pattern: new RegExp(`data-component="article-card"\\s+data-article-id="${ID_PATTERN}"`, 'g'),
    prefetch(ids: string[], locale: string): Promise<Map<string, Article>> {
      return getArticlesByKeys(ids, locale);
    },
  },
  commercial: {
    pattern: /data-component="commercial"\s+data-commercial-id="([a-z0-9]+)"/g,
    // Batched: a "Best 20" article has 20 of these, so the per-id Promise.all shape used by
    // the site-card widget would be 20 Strapi round trips on our highest-traffic page.
    // The trailing quote in the pattern keeps it from matching "commercial-index".
    // Keys are documentIds — numeric ids churn on every republish (see getCommercialsByIds).
    async prefetch(ids: string[]): Promise<Map<string, Commercial>> {
      return getCommercialsByIds(ids);
    },
  },
  'site-card-list': {
    pattern: /data-component="site-card-list"\s+data-site-ids="([^"]+)"/g,
    async prefetch(idStrings: string[]): Promise<Map<string, Site[]>> {
      const parsed = idStrings.map((idsStr) => ({
        idsStr,
        ids: idsStr.split(',').map((s) => s.trim()).filter(Boolean),
      }));
      // One fetch for every id across every list on the page, instead of one per id per list.
      const sites = await getSitesByKeys(parsed.flatMap((p) => p.ids));
      return new Map(
        // Re-index by the AUTHORED id order. Strapi returns `$in` matches in its own order,
        // so mapping over the response instead would silently reshuffle a curated ranking.
        parsed.map(({ idsStr, ids }) => [
          idsStr,
          ids.map((id) => sites.get(id)).filter((s): s is Site => s !== undefined),
        ])
      );
    },
  },
};

/**
 * Commercial ids in document order, deduped.
 *
 * The `commercial-index` widget carries no ids of its own — it is derived from the
 * `commercial` widgets that appear later in the same document. An explicit id list on the
 * index would be a second ordering that goes stale the moment someone reorders or drops an
 * ad, and a wrong index defeats its entire purpose ("find the one you remember").
 */
export function extractCommercialIds(html: string): string[] {
  const re = /data-component="commercial"\s+data-commercial-id="([a-z0-9]+)"/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * Pre-scan HTML for all widget patterns and batch-fetch their data.
 * Returns a map keyed by `${componentType}:${key}`.
 */
export async function prefetchWidgetData(html: string, locale: string): Promise<WidgetData> {
  const data: WidgetData = new Map();
  const fetches: Promise<void>[] = [];

  for (const [type, widget] of Object.entries(widgetTypes)) {
    const keys = new Set<string>();
    let match: RegExpExecArray | null;
    // Reset lastIndex for global regex
    widget.pattern.lastIndex = 0;
    while ((match = widget.pattern.exec(html)) !== null) {
      keys.add(match[1]);
    }
    if (keys.size === 0) continue;

    fetches.push(
      widget.prefetch([...keys], locale).then((map) => {
        for (const [key, value] of map) {
          data.set(`${type}:${key}`, value);
        }
      })
    );
  }

  await Promise.all(fetches);
  return data;
}
