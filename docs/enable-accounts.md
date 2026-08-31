# Re-enabling user accounts & favorites

**Status: disabled for the cams-first launch (2026-08-29).** Account pages 404, the auth and
favorites BFF routes 404, every heart button and favorites view is hidden. Nothing was
deleted: the routes, components, hooks, the Strapi `cam-favorite` content type and its
permission grants are all intact — the feature is behind one flag.

## The switch

`frontend/src/lib/siteSettings.ts`:

```ts
features: {
  // (bundles and liveSex flags live alongside — shown abbreviated)
  accounts: false,   // ← current (launch)
  accounts: true,    // ← restore this to re-enable
},
```

That one line is the whole toggle. Every surface checks the flag:

| Surface | Where the guard lives |
|---|---|
| `/account/login/`, `/account/register/`, `/account/favorites/` pages | `notFound()` at the top of each page — `src/app/[locale]/(chrome)/account/` |
| Auth BFF (`/api/auth/login\|logout\|me\|register`) | 404 guard at the top of every handler |
| Favorites BFF (`/api/favorites` GET/POST/DELETE) | same |
| Session probe (`/api/auth/me` on every page load) | `FavoritesProvider` stays inert — no fetch — in `src/hooks/useFavorites.tsx` |
| Heart buttons (cards + model page) | `CamFavoriteButton` renders `null` |
| "Your favorites — online now" strip on listings | `CamFavoritesStrip` renders `null` |
| Favorites view pill beside listing titles | omitted in `CamListControls` |
| `?fav=1` on the filter route | treated as inert in `live-sex/filter/page.tsx` |
| Header heart icon (desktop) + "My Favorites" drawer row | `src/components/NavMenu.tsx` — note these guards are COMPOUND (`features.liveSex && features.accounts`): flipping `accounts` alone restores them only while `liveSex` is also on |

## What re-enabling brings back (no further work needed)

- Register / login / logout with the `pm_jwt` httpOnly cookie (30 d), email confirmation flow
  through Strapi users-permissions.
- Favoriting: optimistic hearts everywhere (`useFavorites` provider), per-user upsert-guarded
  `cam-favorite` rows in Strapi (ownership enforced server-side from the JWT — see
  `backend/src/api/cam-favorite/controllers/cam-favorite.ts`).
- `/account/favorites/`: online favorites as live cards, offline ones with registry-backed
  thumbnails (`findKnownModels` batch lookup).
- The Favorites view on every listing (pill + `?fav=1`), intersected AFTER the shared memoized
  selection so per-user results never enter the shared cache.

## What was true before disabling (unchanged, for context)

- The backend was NOT touched by the disable: `cam-favorite` schema, its controller, and the
  bootstrap permission grants (`backend/src/index.ts`) still deploy everywhere. Users that
  already exist keep their rows; favorites never sync between environments (excluded in
  `scripts/push-changed-content.mjs`, like `cam-models`).
- `robots.ts` already disallows `/account/` — keep it that way after re-enabling; the pages
  are per-user and noindex.
- Registration email confirmation requires SMTP configured in Strapi (was still pending when
  the feature was parked — check `docs/` and Strapi admin → users-permissions settings before
  relaunch).

## Re-enable checklist

1. Flip `accounts: true` in `frontend/src/lib/siteSettings.ts`.
2. `npx tsc --noEmit` + prod build (guards are additive; nothing else changes).
3. Verify: `/account/login/` renders; `/api/auth/me` answers `{user:null}` logged out; hearts
   appear on cards; the Favorites pill returns next to listing titles; `?fav=1` works logged in.
4. Confirm SMTP/email-confirmation in Strapi if registration should be open.
5. The cams money pages must STAY static — the favorites strip and hearts are client islands
   precisely so listings never read cookies server-side. Nothing about the flag changes that,
   but keep it in mind for any follow-up work.
