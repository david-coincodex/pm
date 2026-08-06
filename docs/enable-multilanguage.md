# Re-enabling multilanguage

**Status: disabled for launch (2026-08-06).** The site runs English-only. German translations,
the language switcher, and all locale plumbing are still in the codebase — nothing was deleted,
only switched off at its single source of truth.

## The switch

`frontend/src/i18n/routing.ts`:

```ts
locales: ['en'],          // ← current (launch)
locales: ['en', 'de'],    // ← restore this to re-enable German
```

That one line is the whole toggle. Everything else derives from `routing.locales` and reacts
automatically:

| Surface | What happens when a second locale is restored |
|---|---|
| URL routing | `/de/…` paths resolve again (next-intl middleware in `src/proxy.ts`; `localePrefix: 'as-needed'` keeps English unprefixed) |
| Language switcher | `src/components/LanguageSwitcher.tsx` renders itself again — it self-hides when `routing.locales.length < 2`, so the nav and footer need no changes |
| hreflang alternates (page metadata) | `localizedAlternates` in `src/lib/pagination.ts` emits the `languages` map again (it emits canonical-only for single-locale builds) |
| hreflang alternates (sitemaps) | `staticEntry`/`buildAlternates` in `src/lib/sitemapData.ts` emit `xhtml:link` alternates again |
| Legacy redirects | `frontend/redirects.config.mjs` expands every rule per locale (`/de/dmca/` → `/de/page/disclaimer/`) — **requires an image rebuild**, see below |
| Static params / layout | `generateStaticParams` and the `hasLocale` guard in `src/app/[locale]/layout.tsx` read the array directly |

**One thing that does NOT react automatically:** `<html lang>` in `src/app/layout.tsx` is
hard-coded to `routing.defaultLocale` (fine while there is one locale). With a second locale,
German pages would claim `lang="en"` — make it per-request, e.g. move `lang` onto the `[locale]`
layout's rendered subtree or set it from the request locale.

## Steps

1. Restore `locales: ['en', 'de']` in `frontend/src/i18n/routing.ts`.
2. Check `frontend/messages/de.json` is current — `en.json` is the source of truth and keys have
   been added while German was off (run the translator per
   [adding-a-language.md](./adding-a-language.md), and remember `--batch`).
3. Rebuild the frontend **image**, not just the container: `next.config.ts` bakes the
   locale-expanded redirect rules at build time, and the dev container does not mount config files
   (`docker compose up -d --build frontend`; a plain `restart` silently runs the old config).
4. Verify: `/de/` renders German, the flag switcher is back in header + footer, `curl -s
   localhost:3002/discounts-sitemap.xml | grep -c hreflang` is non-zero, and `/de/dmca/` 301s to
   `/de/page/disclaimer/`.

## What was deliberately left running

- `messages/de.json` still ships and is kept translatable — only unreachable.
- Strapi stays i18n-enabled (`locale=en` queries everywhere); any `de` content in the CMS is
  simply never requested.
- The `language` message namespace and the two flag SVGs under `public/flags/` remain.

## Adding a third language instead

Follow [adding-a-language.md](./adding-a-language.md) — it covers the message-file generation and
runtime wiring. The steps above still apply (the array + a rebuild).
