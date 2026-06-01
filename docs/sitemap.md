# Sitemap

The sitemap is generated at `/sitemap.xml` by Next.js's built-in metadata route (`frontend/src/app/sitemap.ts`).

## Architecture

A single `sitemap()` function fetches all content types in parallel and returns a flat array of URL entries. A page size of 50 000 is used per fetch — well within Google's per-sitemap limit.

```
frontend/src/app/sitemap.ts   ← Next.js metadata route
frontend/src/lib/strapi.ts    ← sitemap fetch helpers (getSitesForSitemap, etc.)
```

## Content types included

| Content type | Route helper         | Source          |
|--------------|----------------------|-----------------|
| Sites        | `routes.site()`      | Strapi `site`   |
| Bundles      | `routes.bundle()`    | Strapi `bundle` |
| Sales        | `routes.sale()`      | Strapi `sale`   |
| Categories   | `routes.category()`  | Strapi `category` |
| Articles     | `routes.blogArticle()` | Strapi `article` |
| Authors      | `routes.blogAuthor()` | Strapi `author` |
| Reviews      | `routes.review()`    | Strapi `review` |
| Pages        | `routes.page()`      | Strapi `page`   |

Static paths (`/`, `/blog`, `/bundles`, `/reviews`) are also included.

## i18n alternates

For content types that have i18n enabled (`bundle`, `sale`, `site`), the sitemap includes `<xhtml:link rel="alternate">` entries when a `localizations` field confirms the translation exists.

```ts
// alternates are only added when the content has been translated
alternates: buildAlternates(item, path)
```

Supported locales come from `frontend/src/i18n/routing.ts` (`['en', 'de']`).

URL format:
- Default locale (`en`): `https://example.com/path`
- Other locales: `https://example.com/de/path`

## Backend i18n setup

The following Strapi content types have i18n enabled (migration `2026.06.01T00.00.00.enable-i18n-bundle-sale-site.ts` backfills existing rows with `locale = 'en'`):

| Content type | Localized fields                                              |
|--------------|---------------------------------------------------------------|
| `bundle`     | `description`, `content`, `included`                         |
| `sale`       | `description`, `content`, `metaTitle`, `metaDescription`, `navLabel`, `badgeLabel` |
| `site`       | `description`, `short_description`, `included`               |

## Known limitations

### Turbopack dev mode
`generateSitemaps()` (chunked sitemaps) is **not supported** by Turbopack in dev mode. It causes:

```
ENOENT: no such file or directory,
  open '/app/.next/dev/server/app/sitemap.xml/[__metadata_id__]/route/app-paths-manifest.json'
```

The current implementation uses a single `sitemap()` function with no chunking, which works in both dev and production. If chunking becomes necessary in the future, guard it behind a production-only code path or disable Turbopack for local development.

### Docker dev environment
The `.next` build directory lives inside the container (not a volume). `docker compose stop` + `up` reuses the same container and its stale `.next`. To fully clear it:

```bash
docker compose rm -sf frontend && docker compose up frontend -d
```
