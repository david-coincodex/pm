# Production sitemap cross-reference — pornmode.com vs. the new Strapi/Next site

_First pass 2026-08-03; updated same day after the first round of fixes._

Production source: `https://pornmode.com/sitemap_index.xml` (Yoast, 8 sub-sitemaps, 628 unique URLs).
Our side: enumerated from Strapi directly rather than from our own sitemap — see [§1](#1-still-open--our-sitemap-omits-410-pages)
for why that distinction matters.

## Where all 628 production URLs now stand

| Status | Count | Meaning |
|---|---|---|
| **Live** | **129** | our page answers at the identical production path |
| **Redirected** | **6** | 301 via `frontend/redirects.config.mjs` |
| **Self-healing** | **3** | blog route 308s to the canonical URL on its own, no rule needed |
| **Retired** | **456** | deliberate 404 — discontinued, see [§4](#4-deliberate-404s-closed) |
| **Open** | **34** | needs content or a decision — see [§2](#2-open--missing-sites--reviews) and [§3](#3-open--decisions-needed) |

454 of the 628 are intentional 404s, so the meaningful denominator is 174, of which **140 are handled**.

## What changed in this pass

Every change below fixes the **data** so the production URL resolves directly, in preference to adding a
redirect rule. Both are applied by one script, `scripts/fix-url-parity.mjs` (idempotent, dry-run by default).
**⚠️ Applied to the local dev database only** — see [§5](#5-deployment-caveats).

1. **Two site slugs renamed back to production parity** — `team-skeet` → `teamskeet`, `adult-time` →
   `adulttime`. Because the review route reads `site.slug`, this recovered three production URLs at once
   (`/discounts/teamskeet/`, `/reviews/teamskeet/`, `/discounts/adulttime/`) with no redirect hop.
   Verified: all three 200, the old hyphenated paths 404.
2. **One article postId corrected** — `hottest-ebony-pornstars` moved from 2736 to 4239, production's
   canonical id. No redirect rule; the blog route self-heals. See
   [§2a](#2a-why-article-ids-are-corrected-instead-of-redirected).
3. **New declarative redirect file** — `frontend/redirects.config.mjs`, wired into `next.config.ts` via
   `redirects()`. 6 rules, each verified as a single-hop 301 landing on a 200, in both `en` and `de`.
   (`/blog/category/celebrity/` and `/blog/category/hentai/` briefly had rules too, dropped on
   2026-08-04 — celebrity's target category was deleted from the CMS; see §4.)
4. Tag and dead-category archives confirmed as 404 by design.

### Why the redirects went in `redirects.config.mjs` and not `src/lib/redirects.ts`

The pre-existing `src/lib/redirects.ts` runs inside `proxy.ts` on every matched request. The new file is
compiled into the routing manifest at build time and answered **before any application code runs** — no
proxy invocation, no `next-intl` pass, no React. Fixed source → fixed destination belongs there; keep
`src/lib/redirects.ts` for rules that genuinely need request-time logic.

Both now emit **301** (the config file sets `statusCode: 301` rather than Next's `permanent: true`, which
would emit 308) so every permanent redirect the site serves is the same code.

### 2a. Why article ids are corrected instead of redirected

The blog route resolves an article by **postId first, then by slug** — the two are independent keys — and
permanent-redirects to the canonical URL either way:

```ts
(await getArticleByPostId(Number(id), locale)) ?? (await getArticleBySlug(slug, locale))
```

The practical consequence, measured after moving `hottest-ebony-pornstars` from postId 2736 to 4239:

| Request | Result |
|---|---|
| `/blog/4239/10-hottest-black-ebony-pornstars/` (production's URL) | 308 → `/blog/4239/hottest-ebony-pornstars/` |
| `/blog/2736/hottest-ebony-pornstars/` (the old id) | 308 → `/blog/4239/hottest-ebony-pornstars/` |
| `/blog/999999/hottest-ebony-pornstars/` (id wrong, slug right) | 308 → canonical |
| `/blog/4239/anything-at-all/` (id right, slug wrong) | 308 → canonical |
| `/blog/999999/made-up/` (both wrong) | 404 |

So correcting the id costs nothing: the superseded id keeps working through the slug branch. **No article
should ever get a redirect rule** — if its id does not match production, fix the id in the CMS.

Production had published this article twice (2736 on 2020-05-03, 4239 on 2020-11-13, same title);
4239 is the canonical of the pair.

---

## 1. FIXED (2026-08-06) — the sitemap omitted 410 pages, and carried media it shouldn't

The original bug: the old single `app/sitemap.ts` requested `pageSize = 50_000`, `backend/config/api.ts`
caps every REST response at `maxLimit: 100`, and Strapi clamps silently — so we published ~750 pages and
advertised 345. It also attached `<video:video>` blocks (poster + clip URLs) to ad articles.

Replaced by a **sitemap index + four named children** (hand-rolled route handlers — Next has no native
index support), mirroring the Yoast layout production ran:

| Sitemap | Contents | URLs |
|---|---|---|
| `/sitemap.xml` | index only | 4 children |
| `/discounts-sitemap.xml` | every site page | 304 |
| `/reviews-sitemap.xml` | `/reviews/` listing + every review | 305 |
| `/blog-sitemap.xml` | `/blog/` listing + articles + authors | 78 |
| `/pages-sitemap.xml` | home, `/bundles/`, `/categories/`, category/bundle/sale/CMS pages | 61 |

748 URLs total (verified against per-collection published counts), pages only — no video/image entries —
with hreflang alternates preserved and the truncation fixed by paging at the 100-row cap
(`src/lib/sitemapData.ts`). `/categories/` is included for the first time. Each child sitemap gets its own
indexing stats in Search Console.

---

## 2. Open — missing sites & reviews

23 paysites and 8 reviews. All 31 are live (HTTP 200) on production today and 404 on ours. None is a slug
rename: every one was fuzzy-matched (Levenshtein, on both slug and display name) against all 305 of our
site slugs, and nothing scored as a plausible alias.

### 2a. Need both a site page and a review (5)

`bratty-sis`, `nubile-films`, `passion-hd`, `lubed`, `videosz`

### 2b. Need a site page only (18)

| Cluster | Slugs |
|---|---|
| **VR** (5) | `badoinkvr`, `wankzvr`, `vrcosplayx`, `vrbangers`, `18vr` |
| **Nubiles network** (2) | `nubiles-porn`, `nubiles-net` |
| **Networks / studios** (11) | `mile-high-media`, `pornhub-premium`, `21naturals`, `21sextury`, `xempire`, `ddf-network`, `family-strokes`, `pure-mature`, `bang`, `javhd`, `letsdoeit` |

The VR cluster is the most coherent sub-project and the most visible gap: we publish
`/best-vr-porn-sites/` with no VR paysites behind it. Adding `sexlikereal` from 2c would make six.

### 2c. Need a review only (3)

- `tainster`, `sexlikereal` — no site page in production's discounts sitemap either, so these are review-only in both worlds.
- `naughty-america-vr-review` — the closest thing we have is `/reviews/naughty-america/`, which exists and is published. That is a *different product* (the VR spin-off), so pointing one at the other is an editorial call, not a mechanical rename. Left open deliberately.

Two near-misses that are **not** renames and must not be redirected together: `21naturals` scored 0.73
against our `big-naturals`, and `wankzvr` 0.71 against our `wankz` — distinct brands in both cases.

For context, review coverage is otherwise essentially complete: **304 of our 305 sites have a review**
(only `candy-ai` lacks one).

---

## 3. Open — decisions needed

| Production URL | Current | Recommendation |
|---|---|---|
| `/18-u-s-c-§-2257-statement/` | 404 | **Publish it.** 2257 recordkeeping compliance statement, with no equivalent anywhere on the new site. This is the highest-priority single item in the report and it is a legal matter, not an SEO one. |
| `/black-friday-porn-discounts/` | 404 | Almost certainly `/sale/black-friday/` (which exists, 200). Not auto-matched — no slug overlap — so it needs a human to confirm before the rule goes in. |
| `/discounts/` | 301 → `/` | Retarget to `/categories/`. Production's discounts *listing* page sending to the homepage is lossy; `/categories/` is the real equivalent. The rule lives in `src/lib/redirects.ts:23`. |

Resolved and no longer open: the `/blog/4239/` mapping, handled by correcting the postId rather than by a
redirect. The reasoning and the measured behaviour are in [§2a](#2a-why-article-ids-are-corrected-instead-of-redirected).

---

## 4. Deliberate 404s (closed)

454 URLs, no action needed. Recorded here so a future audit does not re-flag them as regressions.

| Group | Count | Rationale |
|---|---|---|
| `/blog/tag/…` archives | 437 | Taxonomies discontinued. Our `tag` content type holds 0 entries and there is no route. |
| `/blog/category/…` with no route | 9 | `featured`, `guides`, `paysites`, `pornstars`, `sex-games`, `top-picks`, `uncategorized` (decision taken knowingly — see [§4a](#4a-the-7-retired-blog-categories-hold-content-we-still-publish)), plus `celebrity` and `hentai` since 2026-08-04, when their redirect rules were dropped (celebrity's target category was deleted from the CMS). |
| "5 sites similar to \<competitor\>" posts | 8 | Removed on purpose. |
| `/paysites/brazzers/` | 1 | Prefix retired; `/discounts/brazzers/` is the live equivalent. |
| `/sample-page/` | 1 | WordPress default stub that should never have been indexed. |

### 4a. The 7 retired blog categories hold content we still publish

An earlier draft of this report dismissed these as "editorial groupings with nothing to point them at."
**That was wrong** and is corrected here, because the distinction matters if the decision is ever revisited.

The blog-category mapping was verified exhaustively: 109 candidate slugs were probed against production
(all 40 of our category slugs, plus `-porn`-stripped and `-and-`-collapsed variants, plus common WordPress
shapes). Production has **exactly 11** blog categories, all under `/blog/category/`, with no empty-but-live
archives that Yoast omitted and no alternate URL base (`/category/…`, `/topics/…` all 404). So the four
topical matches in `redirects.config.mjs` are provably the complete set — none of our other 36 categories
corresponds to the remaining seven.

But five of the seven are *not* empty noise. Their members are articles we already have:

| Prod category | Contents | Members we hold |
|---|---|---|
| `guides` | cancel-subscription guides | **10 / 10** |
| `paysites` | trials, Black Friday, seasonal deals | **8 / 8** |
| `pornstars` | "hottest X pornstars" listicles | **9 / 10** |
| `top-picks` | identical membership to `pornstars` | 9 / 10 |
| `featured` | mixed | **3 / 3** |
| `sex-games` | one post | **1 / 1** |
| `uncategorized` | one post, deliberately removed | 0 / 1 |

So the *content* survived the migration; only the grouping *route* did not. The infrastructure for one
already exists and is unused: `article.categories` is a manyToMany onto the **same** `category` collection
that powers `/best-…-sites/`, and there is an `article.tags` relation alongside it — both populated on
**0 of 76** articles.

**Decision: 404 anyway.** Recorded so this is not re-litigated as an oversight. If it is ever reopened, the
two routes forward are a blanket 301 to `/blog/` (cheap, loses the grouping) or a `/blog/category/[slug]/`
archive route plus a backfill of `article.categories` (restores `guides`, `pornstars`, and `paysites` at
their original production URLs). Note that `pornstars` and `top-picks` are the same archive under two URLs,
so one would be canonical and the other a redirect.

Worth being explicit about the scale: the tag archives alone are **70% of production's sitemap.** Shedding
437 thin pages is a defensible replatform decision, but it does mean the new sitemap will look dramatically
smaller than the old one in Search Console. Expect a large drop in *indexed pages* that is not a
regression — worth writing down somewhere the SEO reporting will see it.

---

## 5. Deployment caveats

- **The data fixes have only been applied to the local dev database.** The backend runs SQLite
  (`DATABASE_CLIENT=sqlite`, `.tmp/data.db` in the `strapi_tmp` volume), so staging and production still
  carry `team-skeet`, `adult-time`, and postId 2736. Re-run `node scripts/fix-url-parity.mjs --apply`
  against each (`STRAPI_URL` in `scripts/.env`) as part of the rollout. The script is idempotent, reports
  already-applied rows, and refuses to act on a slug collision, a duplicate postId, or an unexpected
  starting value — so a partial or repeated run is safe.
- **`next.config.ts` and `redirects.config.mjs` are not mounted into the dev container.** `docker-compose.yml`
  mounts only `src`, `public`, and `messages`, so config changes need `docker compose up -d --build frontend`
  — a plain `restart` silently runs the old config baked into the image. This cost a full debugging cycle;
  worth either adding the mounts or a note in `DEPLOYMENT.md`.
- Nothing here has been committed, and the current branch is `staging`.

## Method / reproducing this

- Production: the 8 sub-sitemaps of `sitemap_index.xml`, deduplicated → 628 URLs.
- Ours: enumerated from Strapi (paging at 100/request) and rebuilt through the `frontend/src/lib/routes.ts`
  helpers, so it reflects real inventory rather than the truncated sitemap → 755 paths.
- Matching: exact path; then punctuation-insensitive slug keys (`teamskeet` == `team-skeet`) within a
  section; then cross-section (tag→site, tag→category, flat page→`/page/`); then postId and slug matching
  for articles. Leftovers were scored with Levenshtein similarity against all 305 site slugs *and* display
  names, then manually reviewed.
- Every redirect, every redirect destination, and every "open" URL was HTTP-checked against both hosts.
  Production's `models-sitemap.xml` is empty (0 URLs), so nothing was compared for it.
- One caveat on the slug-equivalence pass worth knowing if you re-run it: it initially missed
  `/blog/category/celebrity/` → `/best-celebrity-porn-sites/`, because our category slug is
  `celebrity-porn`, not `celebrity`. Production's blog-category slugs are not always a prefix of ours.
