# Re-enabling bundles

**Status: disabled for launch (2026-08-06).** Bundle pages 404, every bundle link and section is
hidden, and bundles are absent from the sitemap. Nothing was deleted: the routes, components,
Strapi content type, and the 15 bundle entries in the CMS are all intact — the feature is behind
one flag.

## The switch

`frontend/src/lib/siteSettings.ts`:

```ts
features: {
  bundles: false,   // ← current (launch)
  bundles: true,    // ← restore this to re-enable
},
```

That one line is the whole toggle. Every surface checks the flag:

| Surface | Where the guard lives |
|---|---|
| `/bundles/` listing + `/bundles/<slug>/` detail | `notFound()` at the top of both pages (and `generateMetadata` returns `{}`) — `src/app/[locale]/(chrome)/bundles/` |
| Header nav link (desktop + mobile drawer) | `src/components/NavMenu.tsx` |
| Footer link | `src/components/Footer.tsx` |
| Bundle carousels on home / site / review / sale pages | Two layers: `SiteBundlesSection` renders `null`, and the fetchers (`getPublishedBundles`, `getBundlesForSite` in `src/lib/strapi.ts`) return `[]` without calling Strapi, so no page pays a wasted round-trip |
| Sitemap | `src/app/pages-sitemap.xml/route.ts` skips the `/bundles/` listing and every bundle URL |

## Steps

1. Set `features.bundles: true` in `frontend/src/lib/siteSettings.ts`.
2. Nothing else — all guards read the flag. `siteSettings.ts` lives under the mounted `src/`, so
   dev hot-reloads it; deployed environments need the normal image rebuild.
3. Verify: `/bundles/` renders the grid (15 bundles), the nav/footer links are back, bundle
   carousels reappear on the home page and site pages, and
   `curl -s localhost:3002/pages-sitemap.xml | grep -c '/bundles/'` is non-zero.

## Content freshness before flipping it on

The 15 bundles in Strapi were authored pre-launch. Before re-enabling, sanity-check in the admin:

- **Offers**: bundles surface pricing via their sites' offers. The offers table was emptied on
  2026-08-06 pending re-import from the pricing sheet — bundles will look broken (no prices, no
  buy buttons) until sites have offers again.
- **Membership**: a few sites were deleted from the CMS around launch (e.g. `candy-ai`); check no
  bundle references a site that no longer exists.

## Related

- `scripts/seed-bundles.mjs` — the original bundle seeder, if the set needs to be rebuilt.
- The `bundles` message namespace in `frontend/messages/*.json` still carries all UI strings.
