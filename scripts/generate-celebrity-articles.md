# Celebrity Nudes Article Generator

`generate-celebrity-articles.mjs` builds "<Celebrity> Nude Photos & Naked Sex Scenes"
articles. Each nude scene becomes a **commercial** whose `site` is Mr. Skin, so the scene
player's promo CTA sells the Mr. Skin deal (the full scenes live there). Pic-type sections
(bikini photos, …) become self-contained **media-gallery** widgets. Prose comes from GPT-5.5
via the opaque-marker pattern from `generate-ad-articles.mjs` — the model writes
`{{SCENE_n}}` / `{{GALLERY_n}}` markers and never sees an id or emits media markup.

## Usage

```bash
cd scripts && export $(cat .env | xargs)

# Bootstrap a job from an existing legacy article (media already in /uploads):
node generate-celebrity-articles.mjs --collect-from-article 1600
#   → writes data/celebrity-media/<jobId>.json and prints a job skeleton to merge into
#     celebrity-jobs.json (fill show / description / awards / releaseDate / showWikipediaUrl)

# Preview (no writes, spends OpenAI):
node generate-celebrity-articles.mjs alexandra-daddario --dry-run

# Media + commercials + Wikipedia context only:
node generate-celebrity-articles.mjs alexandra-daddario --ingest-only

# Full run — the article is PUBLISHED immediately (POST creates a published version):
node generate-celebrity-articles.mjs alexandra-daddario --author mike-wood

# Rebuild an existing article in place (same slug/postId/URL, publishDate preserved,
# modifiedDate stamped):
node generate-celebrity-articles.mjs alexandra-daddario --author mike-wood --force

# Rebuild AND republish — publishDate set to now, modifiedDate cleared (reorders /blog and
# tells Google the post is new; use deliberately):
node generate-celebrity-articles.mjs alexandra-daddario --author mike-wood --force --republish
```

Flags: `--all`, `--force`, `--republish`, `--dry-run`, `--ingest-only`, `--generate-only`,
`--jobs <path>`, `--author <slug>`, `--collect-from-article <postId>`.
Env (`scripts/.env`): `STRAPI_URL`, `STRAPI_TOKEN`, `OPENAI_API_KEY`. Local clips need
system ffmpeg/ffprobe.

## The job file (`celebrity-jobs.json`)

```jsonc
{
  "id": "alexandra-daddario",              // CLI selector + manifest name
  "celebrity": "Alexandra Daddario",
  "wikipediaUrl": "https://en.wikipedia.org/wiki/Alexandra_Daddario",
  "title": "…",                            // H1, verbatim — never model-generated
  "slug": "…",                             // pinned — never slugified from the title
  "postId": 1600,                          // pinned; new articles number above the legacy max
  "categories": [],                        // usually empty — see taxonomy note below
  "tags": ["alexandra-daddario", "celebrity"],
  "notes": "Editor facts. The model never invents facts.",
  "scenes": [{
    "title": "…",                          // becomes the commercial title → the numbered <h2>.
                                           // Author as "<Celebrity> … Scene in \"<Show>\"" —
                                           // every heading then carries celeb + show keywords.
    "show": "True Detective",
    "imdbUrl": "…",                        // → commercial.sceneUrl (VideoObject isBasedOn)
    "showWikipediaUrl": "…",               // fetched as verified show context for the prompt
    "description": "…",                    // REQUIRED — commercial.description, widget-rendered
    "releaseDate": "2014-01-19",           // → VideoObject uploadDate
    "awards": "…",                         // optional; woven into the scene lead-in
    "clip": "data/celebrity-media/<id>/x.mp4",   // local file; transcoded (silent, ≤720p) + uploaded
    "poster": "…",                         // optional; falls back to a frame at 1s
    "stills": ["…"]                        // → commercial.gallery (images only)
  }],
  "galleries": [{
    "kind": "bikini",                      // used in deterministic alts: "<Celebrity> bikini photo <n>"
    "headingHint": "Sexy … Bikini Photos", // GPT writes the <h2> from this
    "images": ["…", { "path": "…", "alt": "override" }]   // images and/or clips (media-gallery
                                           // renders video items as silent autoplay cells)
  }]
}
```

Jobs bootstrapped by `--collect-from-article` omit `clip`/`stills`/`images` paths — the
manifest already points at the existing uploads (`preResolved`) and nothing is re-uploaded.

## Taxonomy — why a `celebrity` TAG, not a category

`api::category.category` is shared with sites: every category generates a
`/best-<slug>-sites/` page and a sitemap entry, so a "celebrities" category would create a
bogus site-category page. Tags are article-only. Convention:

- every celebrity article carries the shared tag `celebrity` **plus** one tag per celebrity
  (`alexandra-daddario`);
- the frontend keys the Article JSON-LD `about: Person` off the `celebrity` tag and takes the
  person's name from the other tag (`sameAs` = the Wikipedia + IMDb links in the body);
- missing tags are auto-created by the script; categories are only warn-resolved.

## Phases

0. **--collect-from-article `<postId>`** — parse an existing article: h2/h3 sections with a
   `<video>` → scenes, image-only sections → galleries, headingless videos → a `more` gallery
   (warned, reassign in the job if wrong). Media URLs are resolved to their existing upload
   ids via `/api/upload/files` — never re-uploaded. The legacy body text is kept in the
   manifest and passed to GPT as reference.
1. **Ingest** — sha256-idempotent transcode/upload of local media (recipe from
   `import-commercials.mjs`: `-an`, ≤720p, crf 27, `+faststart`), deterministic alt text,
   commercial upsert by slug (`mr-skin-<slugified-title>`). State lives in
   `data/celebrity-media/<jobId>.json`, written back after each upsert (crash-resumable).
1b. **Context** — Wikipedia plaintext extracts (celebrity ~3000 chars, each show ~1500) via
   the MediaWiki API, cached in the manifest. The prompt forbids facts from anywhere else.
2. **Generate** — GPT returns `{metaTitle, title, description, contentHtml, faqs}`;
   markers are validated (each exactly once, no strays, no raw `<img>/<video>/<figure>/<div>`)
   before any write; markers swap for widget HTML (attribute order is load-bearing for the
   frontend prefetch regexes); a Mr. Skin site-card is prepended; the article is POSTed
   (published immediately) or PUT in place with `--force`.

## Editorial guardrails

- Published, on-screen scenes only — the prompt refuses leaked/private framing, and every
  factual claim must come from the Wikipedia extracts, the notes, or the per-scene data.
- No prices in prose ever — the site-card and the player CTA render live offer numbers.
- Mr. Skin must have ≥1 active offer or the run fails before any spend.
- FAQs (4–6) render below the article via the existing `FaqSection` (FAQPage JSON-LD included).

## After a run

```bash
node normalize-media-urls.mjs --check     # no absolute /uploads URLs snuck in
```

Then check `/blog/<postId>/<slug>/`: site-card prices, numbered scene headings with lazy
players + promo CTA, gallery lightboxes, FAQ accordion, and in view-source the VideoObject
JSON-LD per scene plus `about: Person` on the Article JSON-LD.
