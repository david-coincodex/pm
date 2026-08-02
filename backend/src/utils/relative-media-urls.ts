/**
 * Normalise uploaded-media URLs in rich-text content to root-relative paths.
 *
 * ## Why this exists
 *
 * The CKEditor media-library button does not insert a relative path. The plugin runs every
 * selected file through its own `prefixFileUrlWithBackendUrl()`, which prefixes
 * `window.strapi.backendURL` onto the `src`, onto EVERY `srcset` candidate, onto `<source src>`
 * and onto the `<a href>` it writes for non-image uploads. `STRAPI_ADMIN_BACKEND_URL` is unset
 * here, so Strapi falls back to `window.location.origin` — meaning the stored HTML captures
 * whichever host the admin panel happened to be open on:
 *
 *   http://localhost:1339/uploads/x.jpg        when authored locally
 *   https://cms-staging.pornmode.com/uploads/… when authored on staging
 *
 * Nothing downstream corrects it: `config/server.ts` sets no `url:`, there are no article
 * lifecycles, no middleware, and the admin PUTs `editor.getData()` verbatim. That is how 42
 * articles ended up carrying 273 references to `http://localhost:1339`, which resolve nowhere
 * else and had to be migrated out.
 *
 * The frontend adds the host back at render (`resolveMediaSrc` in frontend/src/lib/strapi.ts), so
 * the database must only ever hold the relative form. This is the guard that makes that true no
 * matter who writes — admin, REST, or a generator script.
 *
 * ## Scope
 *
 * ONLY paths under `/uploads/`. An editor embedding an image hosted elsewhere must be left
 * untouched, and article bodies are full of internal links like `/discounts/brazzers/` that
 * must not be rewritten either. This is a media normaliser, not a URL rewriter.
 */

/** Absolute or protocol-relative URL whose path starts at `/uploads/`. Captures the path. */
const ABSOLUTE_UPLOAD = /(?:https?:)?\/\/[^/"'\s>]+(\/uploads\/[^"'\s>)]*)/gi;

/** Rewrite every absolute upload URL in a string to its root-relative path. */
export function toRelativeUploads(value: string): string {
  return value.replace(ABSOLUTE_UPLOAD, (_match, path: string) => path);
}

/**
 * Walk a value of unknown shape and normalise every string in it.
 *
 * Recurses because the fields that can hold media are not all plain strings: `bundle.content` and
 * `sale.content` are `blocks` (a JSON AST whose image nodes embed a media object), and components
 * nest arbitrarily. Walking the whole value means a rich-text field added later is covered without
 * anyone remembering to register it.
 *
 * Returns the input unchanged when nothing matched, so a no-op save stays a no-op — important
 * because `updatedAt` drives sitemap `lastmod`.
 */
export function normalizeMediaUrls<T>(value: T): T {
  if (typeof value === 'string') {
    const next = toRelativeUploads(value);
    return (next === value ? value : next) as T;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const n = normalizeMediaUrls(item);
      if (n !== item) changed = true;
      return n;
    });
    return (changed ? next : value) as T;
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const n = normalizeMediaUrls(item);
      if (n !== item) changed = true;
      next[key] = n;
    }
    return (changed ? next : value) as T;
  }
  return value;
}
