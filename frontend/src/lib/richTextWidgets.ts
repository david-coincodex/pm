import { getSiteById, getArticleById, getCommercialsByIds, Site, Article, Commercial } from '@/lib/strapi';

export type WidgetData = Map<string, unknown>;

interface WidgetType {
  /** Regex to extract keys from HTML (e.g. slugs or IDs). Each match group 1 = key. */
  pattern: RegExp;
  /** Batch fetch all needed data for these keys. */
  prefetch: (keys: string[], locale: string) => Promise<Map<string, unknown>>;
}

export const widgetTypes: Record<string, WidgetType> = {
  'site-card': {
    pattern: /data-component="site-card"\s+data-site-id="(\d+)"/g,
    async prefetch(ids: string[]): Promise<Map<string, Site>> {
      const entries = await Promise.all(
        ids.map(async (id) => {
          const site = await getSiteById(Number(id));
          return [id, site] as const;
        })
      );
      const map = new Map<string, Site>();
      for (const [id, site] of entries) {
        if (site) map.set(id, site);
      }
      return map;
    },
  },
  'article-card': {
    pattern: /data-component="article-card"\s+data-article-id="(\d+)"/g,
    async prefetch(ids: string[], locale: string): Promise<Map<string, Article>> {
      const entries = await Promise.all(
        ids.map(async (id) => {
          const article = await getArticleById(Number(id), locale);
          return [id, article] as const;
        })
      );
      const map = new Map<string, Article>();
      for (const [id, article] of entries) {
        if (article) map.set(id, article);
      }
      return map;
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
      const map = new Map<string, Site[]>();
      await Promise.all(
        idStrings.map(async (idsStr) => {
          const ids = idsStr.split(',').map((s) => s.trim()).filter(Boolean);
          const sites = await Promise.all(ids.map((id) => getSiteById(Number(id))));
          map.set(idsStr, sites.filter((s): s is Site => s !== null));
        })
      );
      return map;
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
