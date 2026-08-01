# import-commercials.mjs

Builds the `commercial` records behind the "Best <N> <Site> Ads" articles: one record per
promotional clip (silent looping mp4 + poster + stills + description + original-scene link).

## Prerequisites

- **System ffmpeg/ffprobe** — `brew install ffmpeg`. Used to transcode clips (silent, ≤720p,
  `+faststart`) and to extract a poster frame when the source published none. Deliberately a
  system dependency, not an npm wrapper (org dependency policy).
- `scripts/.env` with `STRAPI_URL`, `STRAPI_TOKEN`.
- For the legacy recreations: the archived pages/media under
  `scripts/data/commercial-archive/<site>/` (gitignored; produced by the one-off Phase-0
  archive run before the WordPress cutover). `--collect` falls back to fetching
  `job.legacySource` live when no archive exists, and `--ingest` falls back to downloading
  media from the manifest URLs.

## Two stages, one reviewable manifest

```
npm run import-commercials -- brazzers-ads --collect     # source -> data/commercials/brazzers.json
# ...review/edit the manifest by hand (fix copy, drop ads, add releaseDate)...
npm run import-commercials -- brazzers-ads --ingest      # manifest -> transcode/upload/upsert
npm run import-commercials -- --all                      # both stages, every job
```

The split is the point: the manifest is the review surface **and** the hand-authoring
schema. If a source can't be scraped (member-only tag page), write the manifest by hand —
or export a spreadsheet to its shape — and run `--ingest` only.

Flags: `--all`, `--collect`, `--ingest`, `--live` (re-fetch source instead of archive),
`--no-transcode`, `--limit N`, `--force` (re-upload even when the content hash is
unchanged — note this creates NEW media entries and orphans the old ones in the Media
Library), `--dry-run`, `--jobs <path>`.

## Jobs — `commercial-jobs.json`

```json
{
  "id": "brazzers-ads",
  "site": "brazzers",                     // Strapi site slug (relation target)
  "legacySource": "https://pornmode.com/blog/1489/brazzers-ads/",
  "adTagPage": "https://www.brazzers.com/videos/tags/1427/top-ad/",   // future collector
  "manifest": "data/commercials/brazzers.json",
  "maxAds": 20
}
```

## Things the script knows that you shouldn't have to rediscover

- **Legacy heading levels lie.** 2 of the 11 Reality Kings ads are headed by `<h2>`, not
  `<h3>` — the collector keys ad blocks on the presence of a `<video>`, never the heading
  level.
- **Clip↔gallery pairing is positional**, never by filename (legacy names have typos:
  `cross-traning`, `plubers`).
- **Heading parsing splits on the en-dash first**, then looks for " by " only in the
  right-hand side — several titles contain " by " mid-sentence.
- **`?ats=` affiliate tokens are stripped** from scene URLs; they encode dead 2020 campaign
  ids and would misattribute conversions. Current affiliate linking happens at render time.
- **Mime is validated in the script** because Strapi's `allowedTypes` is enforced only by
  the admin media picker, NOT by the REST API (measured: a video POSTs happily into an
  images-only field).
- **`-an` in the transcode is not cosmetic**: a video with no audio track is exempt from
  Chrome/WebKit autoplay gesture requirements — that's what makes hover-preview reliable.
- Naming: everything is `commercial`, never `ad`, in identifiers, filenames and API paths —
  adblock filter lists match `/ads/`, `-ad-`, `.ad-*`. Article slugs stay `*-ads` (top-level
  document URLs aren't filtered).

## Idempotency

Per-record sha256 of the source clip is stored in the manifest (`sourceHash`) and mirrored
to Strapi. Re-runs skip unchanged records; uploaded ids are written back into the manifest
after each record, so an interrupted run resumes where it stopped. Upsert key is the
`slug` (`<site>-<slugified-title>`).
