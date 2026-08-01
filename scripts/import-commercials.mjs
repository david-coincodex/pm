#!/usr/bin/env node
/**
 * import-commercials.mjs
 *
 * Builds the `commercial` records behind the "Best <N> <Site> Ads" articles. A commercial
 * is one promotional clip a paysite published to market its subscription: a silent looping
 * mp4, a poster, a few stills, a description of what happens, and a pointer to the scene it
 * advertised.
 *
 * Two stages with a reviewable manifest in between. That split is what gives us
 * resumability, a hand-authoring path when a source can't be scraped, and a chance to fix
 * bad copy before anything reaches Strapi. The manifest schema IS the hand-authoring
 * schema — a human can write one by hand (or export a spreadsheet to it) and run --ingest.
 *
 *   node import-commercials.mjs --collect <jobId>   # source -> manifest. No Strapi writes.
 *   node import-commercials.mjs --ingest  <jobId>   # manifest -> transcode, upload, upsert
 *
 * Options:
 *   --all            Every job in the config
 *   --collect        Stage 1 only
 *   --ingest         Stage 2 only
 *   --live           --collect re-fetches the source URL instead of using the local archive
 *   --no-transcode   Upload clips as-is (default: ffmpeg re-encode, see TRANSCODE below)
 *   --limit N        Cap ads per job
 *   --force          Re-upload + overwrite even when the content hash is unchanged
 *   --dry-run        Print what would happen; no writes of any kind
 *   --jobs <path>    Jobs config (default: scripts/commercial-jobs.json)
 *
 * Requires system ffmpeg/ffprobe for transcoding (`brew install ffmpeg`).
 * Environment (scripts/.env): STRAPI_URL, STRAPI_TOKEN
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { openAsBlob } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';

const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');
const cheerio = _require('cheerio');
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: `${__dirname}/.env`, quiet: true });

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const flagValue = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const has = (name) => process.argv.includes(`--${name}`);

const DRY_RUN = has('dry-run');
const FORCE = has('force');
const LIVE = has('live');
const NO_TRANSCODE = has('no-transcode');
const LIMIT = flagValue('limit') ? Number(flagValue('limit')) : Infinity;
const JOBS_PATH = flagValue('jobs') ?? join(__dirname, 'commercial-jobs.json');
const ARCHIVE_ROOT = join(__dirname, 'data', 'commercial-archive');

// Explicit stages; default to both so a plain run does the whole thing.
let DO_COLLECT = has('collect');
let DO_INGEST = has('ingest');
if (!DO_COLLECT && !DO_INGEST) { DO_COLLECT = true; DO_INGEST = true; }

if (DO_INGEST && !DRY_RUN && !TOKEN) {
  console.error('Error: STRAPI_TOKEN is required for --ingest.');
  process.exit(1);
}
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

// Silent, ≤720p, faststart. Rationale:
//  -an   strips the audio track. The clips are silent anyway, and a video with NO audio
//        track is exempt from Chrome/WebKit's autoplay gesture requirement, which is what
//        makes hover-preview and scroll-autoplay work reliably.
//  +faststart moves `moov` to the front. One legacy clip has it at the end, so it can't
//        begin playing until fully downloaded.
//  crf 27 @ ≤1280w takes the legacy mean from ~6.9 MB to ~2 MB.
const TRANSCODE_ARGS = (input, output) => [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-i', input,
  '-an',
  '-vf', "scale='min(1280,iw)':-2",
  '-c:v', 'libx264', '-profile:v', 'high', '-crf', '27', '-preset', 'slow',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  output,
];

const slugify = (s) =>
  s.toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/&(amp|#0?38);/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);

const decode = (s) =>
  s.replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/&#0?38;|&amp;/g, '&')
   .replace(/&#8220;|&#8221;/g, '"').replace(/&nbsp;/g, ' ')
   .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
   .replace(/\s+/g, ' ').trim();

/** WordPress size suffix: foo-1024x683.jpg -> foo.jpg */
const stripWpSize = (u) => u.replace(/-\d+x\d+(?=\.[a-z]+(?:$|\?))/i, '');

/**
 * Affiliate tokens in legacy scene links encode 2020 campaign/sub ids. Carrying them
 * forward would credit conversions to a dead campaign, so strip the query entirely.
 */
const cleanSceneUrl = (u) => {
  if (!u) return null;
  try {
    const url = new URL(u);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch { return null; }
};

// ── Stage 1: collect ────────────────────────────────────────────────────────────

/**
 * Split a legacy ad heading into its parts.
 *
 * Two formats exist in the legacy articles:
 *   "1. Busty Nurse Gets Fucked Hard – Registered Nurse Naturals by Skylar Vox"   (RK)
 *   "1. Warm Welcum"                                                              (Brazzers)
 *
 * The en-dash is the reliable delimiter, so split on it FIRST and only look for " by "
 * in the right-hand side. Parsing " by " globally is wrong: several titles contain it
 * mid-sentence ("Hot Young Girl Gets Fucked by Fellow Traveller and a Stranger – …"),
 * which would truncate the title and invent performers.
 */
function parseHeading(raw) {
  const heading = decode(raw).replace(/^\s*\d+[.)]\s*/, '');
  const dash = heading.search(/\s+[–—]\s+/);
  if (dash === -1) return { title: heading, sceneTitle: null, performers: null };

  const title = heading.slice(0, dash).trim();
  const rest = heading.slice(dash).replace(/^\s*[–—]\s*/, '').trim();
  const by = rest.search(/\s+by\s+/i);
  return by === -1
    ? { title, sceneTitle: rest || null, performers: null }
    : {
        title,
        sceneTitle: rest.slice(0, by).trim() || null,
        performers: rest.slice(by).replace(/^\s*by\s+/i, '').trim() || null,
      };
}

/**
 * Parse ad blocks out of one of our own legacy WordPress articles.
 *
 * Walks the TOP-LEVEL children of the content container in document order, tracking the
 * most recent heading. Each `wp-block-columns` containing a <video> starts an ad; the
 * galleries that follow it (before the next heading) belong to that ad.
 *
 * Why not `$('h3').nextUntil('h3')`: the legacy markup is inconsistent — 2 of the 11
 * Reality Kings ads are headed by <h2> rather than <h3>, which silently merged two ads
 * into one block and dropped a clip. The heading level cannot be trusted; the video can.
 * The description also lives *inside* the columns div, not as a sibling of the heading.
 *
 * Clip↔gallery pairing is POSITIONAL, never by filename: the legacy filenames don't match
 * (clip `cross-training-for-cocks...` vs image `cross-traning-for-cock...`, plus `plubers`).
 */
function collectFromLegacyHtml(html, job) {
  const $ = cheerio.load(html);
  const container = $('div.inner-post-entry').first();
  if (!container.length) throw new Error('content container div.inner-post-entry not found');

  const records = [];
  let heading = null;

  container.children().each((_, el) => {
    const $el = $(el);
    const tag = el.tagName?.toLowerCase();

    if (/^h[1-4]$/.test(tag ?? '')) {
      heading = $el.html() ?? '';
      return;
    }

    // Galleries after an ad block belong to that ad.
    if ($el.is('.wp-block-gallery') || $el.find('.wp-block-gallery').length) {
      const current = records[records.length - 1];
      if (!current || current._closed) return;
      $el.find('img').addBack('img').each((__, img) => {
        const $img = $(img);
        const full = $img.attr('data-full-url') || stripWpSize($img.attr('src') ?? '');
        if (full && !current.galleryUrls.includes(full)) current.galleryUrls.push(full);
      });
      return;
    }

    const video = $el.find('video').first();
    if (!video.length) return;

    // Close the previous ad so a stray later gallery can't attach to it.
    if (records.length) records[records.length - 1]._closed = true;

    const { title, sceneTitle, performers } = parseHeading(heading ?? '');

    // Description = first substantial paragraph inside this block. This is the SEO asset:
    // people google what happens in the ad to identify the scene. `.find` (not `.filter`)
    // because it sits in a nested column, not as a sibling.
    let description = '';
    $el.find('p').each((__, p) => {
      if (description) return;
      const txt = decode($(p).text());
      if (txt.length > 60) description = txt;
    });

    // Scene link: an external link that isn't the affiliate CTA button.
    let sceneUrl = null;
    $el.find('a[href^="http"]').each((__, a) => {
      if (sceneUrl) return;
      const $a = $(a);
      const href = $a.attr('href') ?? '';
      if (href.includes('pornmode.com')) return;
      if (($a.attr('class') ?? '').includes('wp-block-button__link')) return;
      sceneUrl = cleanSceneUrl(href);
    });

    const videoSrc = video.attr('src');
    if (!videoSrc) return;

    // WP stores uploads under /uploads/<yyyy>/<mm>/ — the closest thing we have to the
    // ad's publish date, and VideoObject's uploadDate (one of Google's four required
    // properties) needs it.
    const dateMatch = videoSrc.match(/\/uploads\/(\d{4})\/(\d{2})\//);
    const releaseDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-01` : null;

    records.push({
      _closed: false,
      galleryUrls: [],
      title,
      slug: `${job.site}-${slugify(title)}`,
      description,
      performers,
      sceneTitle,
      sceneUrl,
      clipUrl: videoSrc,
      posterUrl: video.attr('poster') || null,
      // Filled by --ingest; presence is what makes re-runs resumable.
      clipId: null,
      posterId: null,
      galleryIds: null,
      sourceHash: null,
      sourceUrl: job.legacySource ?? null,
      releaseDate,
      durationSeconds: null,
    });
  });

  // `_closed` is internal bookkeeping for gallery attribution — keep it out of the manifest.
  return records.map(({ _closed, ...rest }) => rest);
}

async function collect(job) {
  const archiveDir = join(ARCHIVE_ROOT, job.site);
  const archivedPage = join(archiveDir, '_page.html');

  let html;
  if (LIVE || !existsSync(archivedPage)) {
    if (!job.legacySource) throw new Error(`${job.id}: no legacySource and no local archive`);
    console.log(`  fetching ${job.legacySource}`);
    const res = await fetch(job.legacySource, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`${job.legacySource}: ${res.status}`);
    html = await res.text();
  } else {
    console.log(`  using archived page ${archivedPage.replace(__dirname + '/', '')}`);
    html = readFileSync(archivedPage, 'utf8');
  }

  let records = collectFromLegacyHtml(html, job);
  if (Number.isFinite(LIMIT)) records = records.slice(0, LIMIT);
  if (job.maxAds) records = records.slice(0, job.maxAds);

  // Report anything a human should look at before ingest.
  const problems = [];
  records.forEach((r, i) => {
    if (!r.description) problems.push(`#${i + 1} ${r.title}: no description`);
    if (!r.galleryUrls.length) problems.push(`#${i + 1} ${r.title}: no gallery images`);
  });

  const manifestPath = join(__dirname, job.manifest);
  mkdirSync(dirname(manifestPath), { recursive: true });

  // Preserve ids already recorded, keyed by slug, so re-collecting doesn't undo an ingest.
  if (existsSync(manifestPath)) {
    const prev = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const bySlug = new Map((prev.commercials ?? []).map((c) => [c.slug, c]));
    for (const r of records) {
      const old = bySlug.get(r.slug);
      if (old) Object.assign(r, {
        clipId: old.clipId, posterId: old.posterId, galleryIds: old.galleryIds,
        sourceHash: old.sourceHash, durationSeconds: old.durationSeconds,
        // The upsert back-references too — dropping them made a re-collect sever the link
        // between manifest records and their Strapi documents.
        commercialId: old.commercialId, commercialDocumentId: old.commercialDocumentId,
      });
    }
  }

  const manifest = { job: job.id, site: job.site, source: job.legacySource ?? null, commercials: records };
  if (!DRY_RUN) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`  collected ${records.length} ads`);
  records.forEach((r, i) =>
    console.log(
      `    ${String(i + 1).padStart(2)}. ${r.title}` +
        (r.sceneTitle ? ` – ${r.sceneTitle}` : '') +
        `  [desc ${r.description.length}c, ${r.galleryUrls.length} img${r.sceneUrl ? ', scene link' : ''}]`,
    ),
  );
  if (problems.length) { console.log('  ⚠ review:'); problems.forEach((p) => console.log(`     ${p}`)); }
  if (DRY_RUN) console.log('  --dry-run: manifest not written');
  else console.log(`  wrote ${job.manifest}`);
  return manifest;
}

// ── Stage 2: ingest ─────────────────────────────────────────────────────────────

/** Resolve a remote media URL to its locally archived file, if we have it. */
function localArchivePath(site, url) {
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop());
  for (const candidate of [name, stripWpSize(name)]) {
    const p = join(ARCHIVE_ROOT, site, candidate);
    if (existsSync(p) && statSync(p).size > 1024) return p;
  }
  return null;
}

async function fetchToTemp(url, hintName) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`${url}: suspiciously small (${buf.length}B)`);
  const p = join(tmpdir(), `pm-${Date.now()}-${hintName}`);
  writeFileSync(p, buf);
  return p;
}

/**
 * Upload a local file. Streams via openAsBlob so multi-MB clips are never buffered.
 *
 * Validates the mime ourselves: Strapi's `allowedTypes` is enforced only by the admin
 * media picker, NOT by the REST API — a video POSTs happily into an images-only field
 * (measured), so nothing downstream would catch a mix-up.
 */
async function uploadLocalFile(path, filename, type, expectPrefix) {
  if (expectPrefix && !type.startsWith(expectPrefix)) {
    throw new Error(`${filename}: expected ${expectPrefix}* but got ${type}`);
  }
  const form = new FormData();
  form.append('files', await openAsBlob(path, { type }), filename);
  const res = await fetch(`${STRAPI_URL}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` }, // no Content-Type: FormData sets the boundary
    body: form,
  });
  if (!res.ok) throw new Error(`upload ${filename}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const [file] = await res.json();
  return file ? { id: file.id, url: file.url } : null;
}

function probeDuration(path) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', path,
    ], { encoding: 'utf8' });
    const secs = Math.round(parseFloat(out.trim()));
    return Number.isFinite(secs) ? secs : null;
  } catch { return null; }
}

/** Grab a frame ~1s in as the poster when the source published none. */
function extractPoster(clipPath, outPath) {
  try {
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', '1', '-i', clipPath, '-frames:v', '1', '-q:v', '3', outPath,
    ]);
    return existsSync(outPath) ? outPath : null;
  } catch { return null; }
}

async function findExisting(slug) {
  const res = await fetch(
    `${STRAPI_URL}/api/commercials?filters[slug][$eq]=${encodeURIComponent(slug)}&fields[0]=slug&status=draft`,
    { headers },
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.[0] ?? null;
}

async function resolveSiteDocumentId(slug) {
  const res = await fetch(
    `${STRAPI_URL}/api/sites?filters[slug][$eq]=${encodeURIComponent(slug)}&fields[0]=slug`,
    { headers },
  );
  if (!res.ok) throw new Error(`site lookup ${slug}: ${res.status}`);
  const json = await res.json();
  const site = json.data?.[0];
  if (!site) throw new Error(`site not found: ${slug}`);
  return site.documentId;
}

async function ingest(job) {
  const manifestPath = join(__dirname, job.manifest);
  if (!existsSync(manifestPath)) throw new Error(`no manifest at ${job.manifest} — run --collect first`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const siteDocId = DRY_RUN ? '<site>' : await resolveSiteDocumentId(job.site);

  let created = 0, updated = 0, skipped = 0, failed = 0;

  for (const [i, rec] of manifest.commercials.entries()) {
    const label = `${String(i + 1).padStart(2)}. ${rec.title}`;
    try {
      // ── clip: prefer the local archive (WordPress is the only source and may vanish)
      const clipLocal = localArchivePath(job.site, rec.clipUrl);
      const clipSource = clipLocal ?? (DRY_RUN ? null : await fetchToTemp(rec.clipUrl, 'clip.mp4'));
      if (!clipSource) { console.log(`  ${label}: dry-run, no local clip`); skipped++; continue; }

      const hash = createHash('sha256').update(readFileSync(clipSource)).digest('hex');
      const unchanged = rec.sourceHash === hash && rec.clipId;
      if (unchanged && !FORCE) { console.log(`  ${label}: unchanged, skip`); skipped++; continue; }

      const duration = probeDuration(clipSource);

      if (DRY_RUN) {
        console.log(
          `  ${label}: would ${rec.clipId ? 'update' : 'create'}` +
            ` (clip ${(statSync(clipSource).size / 1048576).toFixed(2)} MB, ${duration ?? '?'}s,` +
            ` ${rec.galleryUrls.length} img)`,
        );
        continue;
      }

      // ── transcode
      let uploadPath = clipSource;
      if (!NO_TRANSCODE) {
        const out = join(tmpdir(), `pm-tc-${slugify(rec.title)}.mp4`);
        execFileSync('ffmpeg', TRANSCODE_ARGS(clipSource, out));
        const before = statSync(clipSource).size, after = statSync(out).size;
        console.log(`  ${label}: transcoded ${(before / 1048576).toFixed(2)} -> ${(after / 1048576).toFixed(2)} MB`);
        uploadPath = out;
      }

      const clipUp = await uploadLocalFile(
        uploadPath, `${rec.slug}.mp4`, 'video/mp4', 'video/',
      );

      // ── poster: published poster -> archived still -> extracted frame
      let posterId = rec.posterId;
      if (!posterId || FORCE) {
        let posterPath = null;
        if (rec.posterUrl) posterPath = localArchivePath(job.site, rec.posterUrl) ?? await fetchToTemp(rec.posterUrl, 'poster.jpg');
        if (!posterPath && rec.galleryUrls[0]) posterPath = localArchivePath(job.site, rec.galleryUrls[0]);
        if (!posterPath) posterPath = extractPoster(uploadPath, join(tmpdir(), `pm-poster-${slugify(rec.title)}.jpg`));
        if (posterPath) {
          const up = await uploadLocalFile(posterPath, `${rec.slug}-poster.jpg`, 'image/jpeg', 'image/');
          posterId = up?.id ?? null;
        }
      }

      // ── gallery
      let galleryIds = rec.galleryIds;
      if (!galleryIds?.length || FORCE) {
        galleryIds = [];
        for (const [gi, gUrl] of rec.galleryUrls.entries()) {
          const p = localArchivePath(job.site, gUrl) ?? await fetchToTemp(gUrl, `g${gi}.jpg`);
          const ext = p.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
          const up = await uploadLocalFile(
            p, `${rec.slug}-${gi + 1}.${ext}`, ext === 'png' ? 'image/png' : 'image/jpeg', 'image/',
          );
          if (up) galleryIds.push(up.id);
        }
      }

      const data = {
        title: rec.title,
        slug: rec.slug,
        description: rec.description || rec.title,
        clip: clipUp?.id ?? null,
        poster: posterId,
        gallery: galleryIds,
        site: siteDocId,
        sceneTitle: rec.sceneTitle,
        sceneUrl: rec.sceneUrl,
        performers: rec.performers,
        releaseDate: rec.releaseDate ?? null,
        durationSeconds: duration,
        popularity: manifest.commercials.length - i, // legacy article order = editorial ranking
        sourceUrl: rec.sourceUrl,
        sourceHash: hash,
      };

      const existing = await findExisting(rec.slug);
      const res = existing
        ? await fetch(`${STRAPI_URL}/api/commercials/${existing.documentId}`, {
            method: 'PUT', headers, body: JSON.stringify({ data }),
          })
        : await fetch(`${STRAPI_URL}/api/commercials`, {
            method: 'POST', headers, body: JSON.stringify({ data }),
          });
      if (!res.ok) throw new Error(`${existing ? 'PUT' : 'POST'} ${res.status} ${(await res.text()).slice(0, 240)}`);
      const saved = (await res.json()).data;

      // Write ids back so a re-run is resumable.
      Object.assign(rec, {
        clipId: clipUp?.id ?? null, posterId, galleryIds,
        sourceHash: hash, durationSeconds: duration,
        commercialId: saved.id, commercialDocumentId: saved.documentId,
      });
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

      console.log(`  ${label}: ${existing ? 'updated' : 'created'} id=${saved.id}`);
      existing ? updated++ : created++;
    } catch (err) {
      console.error(`  ${label}: FAILED ${err.message}`);
      failed++;
    }
  }

  console.log(`  created ${created}, updated ${updated}, skipped ${skipped}, failed ${failed}`);
  return failed;
}

// ── main ────────────────────────────────────────────────────────────────────────

const jobs = JSON.parse(readFileSync(JOBS_PATH, 'utf8'));
const requested = process.argv.slice(2).filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const selected = has('all')
  ? jobs
  : jobs.filter((j) => requested.includes(j.id));

if (!selected.length) {
  console.error(
    `No jobs selected. Use --all or a job id.\nAvailable: ${jobs.map((j) => j.id).join(', ')}`,
  );
  process.exit(1);
}

let exitCode = 0;
for (const job of selected) {
  console.log(`\n=== ${job.id} (${job.site}) ===`);
  if (DO_COLLECT) await collect(job);
  if (DO_INGEST) exitCode += await ingest(job);
}
process.exit(exitCode ? 1 : 0);
