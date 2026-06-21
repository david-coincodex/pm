#!/usr/bin/env node
/**
 * discover-review-links.mjs
 *
 * For each site in Strapi, searches known external review sites to find
 * matching review URLs and saves them to the site's reviewSources field.
 *
 * Usage:
 *   node scripts/discover-review-links.mjs [options] [slug1 slug2 ...]
 *
 * Options:
 *   --all       Process all sites
 *   --force     Overwrite existing reviewSources (default: skip sites that already have them)
 *   --site=slug Process a single site slug
 *   --sites=a,b Process a comma-separated list of site slugs
 *   --source=x  Only run a specific review source (repeatable, also accepts comma-separated values)
 *
 * Environment:
 *   STRAPI_URL      (default: http://localhost:1339)
 *   STRAPI_TOKEN    API token for Strapi
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv');
dotenv.config({ path: `${__dirname}/.env`, quiet: true });
import { chromium } from 'playwright';

// ── Config ─────────────────────────────────────────────────────────────────────

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const TOKEN = process.env.STRAPI_TOKEN;

if (!TOKEN) {
  console.error('Error: STRAPI_TOKEN is required.');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};

const sourceKey = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

// ── Slug helpers ───────────────────────────────────────────────────────────────

/** "Adult Time" → "adulttime" */
const toNoHyphen = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** "Adult Time" → "adult-time" */
const toHyphen = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * For a no-hyphen string, generate all single-split variants e.g.
 * "metart" → ["m-etart", "me-tart", "met-art", "meta-rt", "metar-t"]
 * Useful for sites like MetArt → met-art, FakeHub → fake-hub, etc.
 */
function splitVariants(s) {
  const out = [];
  for (let i = 2; i <= s.length - 2; i++) {
    out.push(`${s.slice(0, i)}-${s.slice(i)}`);
  }
  return out;
}

/**
 * Build all slug/name variants to try for a given site.
 * Includes the stored slug, name-derived forms, optional platform/network name,
 * and all single-split positions for no-hyphen slugs.
 */
function slugVariants(slug, name, networkName) {
  const noHyphenSlug = toNoHyphen(slug);
  const noHyphenName = toNoHyphen(name);
  const andName = name.replace(/&/g, ' and ').replace(/\band\b/gi, '&');
  const hyphenAndName = toHyphen(name.replace(/&/g, ' and '));
  const noHyphenAndName = toNoHyphen(name.replace(/&/g, ' and '));
  const hyphenAmpName = toHyphen(andName);
  const noHyphenAmpName = toNoHyphen(andName);
  const base = new Set([
    slug,                          // stored slug e.g. "adult-time"
    noHyphenSlug,                  // "adulttime"
    noHyphenName,                  // "adulttime" from name
    toHyphen(name),                // "adult-time" from name
    hyphenAndName,
    noHyphenAndName,
    hyphenAmpName,
    noHyphenAmpName,
    slug.replace(/-/g, ''),        // remove all hyphens from slug
    `${noHyphenSlug}com`,          // e.g. "blackedcom"
    `${slug}com`,                  // e.g. "blacked-com" (unlikely but cheap)
  ]);
  // If the slug has no hyphens, try all single split-point variants
  // e.g. "metart" → "met-art", "fakehub" → "fake-hub"
  if (!slug.includes('-')) {
    for (const v of splitVariants(noHyphenSlug)) base.add(v);
  }
  // Also split the name-derived no-hyphen form if it differs from the slug
  if (noHyphenName !== noHyphenSlug && !name.includes(' ') === false) {
    for (const v of splitVariants(noHyphenName)) base.add(v);
  }
  if (networkName) {
    base.add(toNoHyphen(networkName));
    base.add(toHyphen(networkName));
  }
  return [...base];
}

// ── Source definitions ─────────────────────────────────────────────────────────

/**
 * Each source defines a findUrl(page, site) async function.
 * Returns a URL string if found, null otherwise.
 *
 * URL patterns discovered via probing:
 *  - thebestporn:   /review/{slug}         (no hyphens, e.g. /review/adulttime)
 *  - adultreviews:  /review/{cat}/{slug}.html  (cat unknown; use search)
 *  - rabbitsreviews: /porn/reviews/{slug} or /porn/deals/site/{slug} (hyphenated slug)
 *  - mrporngeek:    /review/{slug}/         (hyphenated slug)
 *  - porninspector: /reviews/review/{slug}/ (hyphenated slug)
 */
const SOURCES = [
  {
    name: 'TheBestPorn',
    async findUrl(page, site) {
      const sitemapMatch = await findUrlFromMap(getTheBestPornMap, site);
      if (sitemapMatch) return sitemapMatch;

      for (const v of slugVariants(site.slug, site.name, site.networkName)) {
        const url = `https://www.thebestporn.com/review/${v}`;
        if (await probeUrl(page, url)) return url;
        const urlSlash = `${url}/`;
        if (await probeUrl(page, urlSlash)) return urlSlash;
      }
      // Fallback: search their site and look for a matching link
      return searchPageForLink(page, `https://www.thebestporn.com/?s=${encodeURIComponent(site.name)}`,
        'thebestporn.com/review/', site.slug, site.name);
    },
  },
  {
    name: 'AdultReviews',
    async findUrl(page, site) {
      const sitemapMatch = await findUrlFromMap(getAdultReviewsMap, site);
      if (sitemapMatch) return sitemapMatch;

      // Their search is broken (redirects to homepage nav only).
      // URL pattern: /review/{category}/{hyphen-slug}.html
      // Probe common paysite categories with all slug variants.
      const CATEGORIES = ['reality', 'pornstar', 'amateur', 'teen', 'lesbian',
        'milf', 'interracial', 'bdsm', 'anal', 'blowjob', 'gay', 'fetish', 'ebony'];
      const variants = slugVariants(site.slug, site.name, site.networkName)
        .map(v => toHyphen(v))
        .filter((v, i, a) => a.indexOf(v) === i); // dedupe
      for (const cat of CATEGORIES) {
        for (const v of variants) {
          const url = `https://www.adultreviews.com/review/${cat}/${v}.html`;
          if (await probeUrl(page, url)) return url;
        }
      }
      return null;
    },
  },
  {
    name: 'RabbitsReviews',
    async findUrl(page, site) {
      const sitemapMatch = await findUrlFromMap(getRabbitsReviewsMap, site, {
        extraVariants: [
          `${site.slug}-network`,
          `${toNoHyphen(site.slug)}-network`,
          `${site.slug}-pass`,
          `${site.slug}-reviews`,
        ],
      });
      if (sitemapMatch) return sitemapMatch;

      const base = slugVariants(site.slug, site.name, site.networkName);
      // RabbitsReviews often appends "-network", "-pass", or "-reviews" to the slug
      const extra = [
        `${site.slug}-network`,
        `${toNoHyphen(site.slug)}-network`,
        `${site.slug}-pass`,
        `${site.slug}-reviews`,
      ];
      const variants = [...new Set([...base, ...extra])];
      // Try both known path patterns
      for (const path of ['/porn/reviews/', '/porn/deals/site/']) {
        for (const v of variants) {
          const url = `https://www.rabbitsreviews.com${path}${v}`;
          if (await probeUrl(page, url)) return url;
        }
      }
      return null;
    },
  },
  {
    name: 'MrPornGeek',
    async findUrl(page, site) {
      const sitemapMatch = await findUrlFromMap(getMrPornGeekMap, site);
      if (sitemapMatch) return sitemapMatch;

      for (const v of slugVariants(site.slug, site.name, site.networkName)) {
        const url = `https://www.mrporngeek.com/review/${v}/`;
        if (await probeUrl(page, url)) return url;
      }
      // Fallback: search
      return searchPageForLink(page, `https://www.mrporngeek.com/?s=${encodeURIComponent(site.name)}`,
        'mrporngeek.com/review/', site.slug, site.name);
    },
  },
  {
    name: 'PornInspector',
    async findUrl(page, site) {
      const sitemapMatch = await findUrlFromMap(getPornInspectorMap, site, {
        extraVariants: [
          `${site.slug}-pass`,
          `${site.slug}-network`,
          `${site.slug}-reviews`,
        ],
      });
      if (sitemapMatch) return sitemapMatch;

      const base = slugVariants(site.slug, site.name, site.networkName);
      const extra = [
        `${site.slug}-pass`,
        `${site.slug}-network`,
        `${site.slug}-reviews`,
      ];
      const variants = [...new Set([...base, ...extra])];
      for (const v of variants) {
        const url = `https://www.porninspector.com/reviews/review/${v}/`;
        if (await probeUrl(page, url)) return url;
      }
      // Fallback: scrape their reviews listing for a matching link
      return searchPageForLink(page, `https://www.porninspector.com/reviews/?s=${encodeURIComponent(site.name)}`,
        'porninspector.com/reviews/review/', site.slug, site.name);
    },
  },
  {
    name: 'DiscountedPorn',
    aliases: ['discountedporn', 'discountedporn.com'],
    async findUrl(_page, site) {
      const dealMap = await getDiscountedPornDealMap();
      for (const variant of slugVariants(site.slug, site.name, site.networkName)) {
        const match = dealMap.get(toNoHyphen(variant));
        if (match) return match;
      }
      return null;
    },
  },
  {
    name: 'PornDiscounts',
    aliases: ['porndiscounts', 'porndiscounts.com'],
    async findUrl(_page, site) {
      const discountMap = await getPornDiscountsMap();
      for (const variant of slugVariants(site.slug, site.name, site.networkName)) {
        const match = discountMap.get(toNoHyphen(variant));
        if (match) return match;
      }
      return null;
    },
  },
  {
    name: 'PornDeals',
    aliases: ['porndeals', 'porndeals.com'],
    async findUrl(_page, site) {
      return findUrlFromMap(getPornDealsMap, site, {
        extraVariants: [
          `${site.slug}-network`,
          `${toNoHyphen(site.slug)}-network`,
        ],
      });
    },
  },
];

let discountedPornDealMapPromise;
let pornDiscountsMapPromise;
let theBestPornMapPromise;
let adultReviewsMapPromise;
let rabbitsReviewsMapPromise;
let mrPornGeekMapPromise;
let pornInspectorMapPromise;
let pornDealsMapPromise;

function addMapEntry(map, key, loc) {
  if (!key) return;
  map.set(toNoHyphen(key), loc);
}

async function fetchSitemapLocs(url) {
  const res = await fetch(url);
  if (!res.ok) {
    return [];
  }

  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

async function buildMapFromLocs(urls, addKeys) {
  const map = new Map();

  for (const loc of urls) {
    let pathname;
    try {
      pathname = new URL(loc).pathname;
    } catch {
      continue;
    }

    const parts = pathname.split('/').filter(Boolean);
    addKeys(map, loc, parts);
  }

  return map;
}

async function findUrlFromMap(getMap, site, options = {}) {
  const map = await getMap();
  const variants = [...new Set([
    ...slugVariants(site.slug, site.name, site.networkName),
    ...(options.extraVariants ?? []),
  ])];

  for (const variant of variants) {
    const match = map.get(toNoHyphen(variant));
    if (match) return match;
  }

  return null;
}

async function getDiscountedPornDealMap() {
  if (!discountedPornDealMapPromise) {
    discountedPornDealMapPromise = fetch('https://www.discountedporn.com/sitemap.xml')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch sitemap: ${res.status}`);
        }
        return res.text();
      })
      .then((xml) => {
        const map = new Map();
        const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);

        for (const match of matches) {
          const loc = match[1];
          let pathname;
          try {
            pathname = new URL(loc).pathname;
          } catch {
            continue;
          }

          const parts = pathname.split('/').filter(Boolean);
          if (parts[0] !== 'deal' || !parts[1]) continue;

          map.set(toNoHyphen(parts[1]), loc);
        }

        return map;
      });
  }

  return discountedPornDealMapPromise;
}

async function getPornDiscountsMap() {
  if (!pornDiscountsMapPromise) {
    pornDiscountsMapPromise = fetch('https://www.porndiscounts.com/sitemap-discounts-discounts.xml')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch sitemap: ${res.status}`);
        }
        return res.text();
      })
      .then((xml) => {
        const map = new Map();
        const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);

        for (const match of matches) {
          const loc = match[1];
          let pathname;
          try {
            pathname = new URL(loc).pathname;
          } catch {
            continue;
          }

          const parts = pathname.split('/').filter(Boolean);
          if (parts[0] !== 'porn-discounts' || !parts[1]) continue;

          const tail = parts.at(-1);
          if (!tail) continue;

          map.set(toNoHyphen(tail), loc);

          if (parts.length === 2) {
            map.set(toNoHyphen(parts[1]), loc);
          }
        }

        return map;
      });
  }

  return pornDiscountsMapPromise;
}

async function getTheBestPornMap() {
  if (!theBestPornMapPromise) {
    theBestPornMapPromise = fetchSitemapLocs('https://www.thebestporn.com/sitemap.xml')
      .then((indexUrls) => Promise.all(indexUrls.map(fetchSitemapLocs)))
      .then((chunks) => chunks.flat())
      .then((locs) => buildMapFromLocs(locs, (map, loc, parts) => {
        if (parts[0] !== 'review' || !parts[1]) return;
        addMapEntry(map, parts[1], loc);
      }));
  }

  return theBestPornMapPromise;
}

async function getAdultReviewsMap() {
  if (!adultReviewsMapPromise) {
    adultReviewsMapPromise = fetchSitemapLocs('https://www.adultreviews.com/sitemap.xml')
      .then((locs) => buildMapFromLocs(locs, (map, loc, parts) => {
        if (parts[0] !== 'review' || !parts[2]) return;
        addMapEntry(map, parts[2].replace(/\.html$/i, ''), loc);
      }));
  }

  return adultReviewsMapPromise;
}

async function getRabbitsReviewsMap() {
  if (!rabbitsReviewsMapPromise) {
    rabbitsReviewsMapPromise = fetchSitemapLocs('https://www.rabbitsreviews.com/sitemap.xml')
      .then((indexUrls) => Promise.all(indexUrls.filter((url) => !url.includes('image')).map(fetchSitemapLocs)))
      .then((chunks) => chunks.flat())
      .then((locs) => buildMapFromLocs(locs, (map, loc, parts) => {
        if (parts[0] !== 'porn') return;
        if (parts[1] === 'reviews' && parts[2]) {
          addMapEntry(map, parts[2], loc);
        }
        if (parts[1] === 'deals' && parts[2] === 'site' && parts[3]) {
          addMapEntry(map, parts[3], loc);
        }
      }));
  }

  return rabbitsReviewsMapPromise;
}

async function getMrPornGeekMap() {
  if (!mrPornGeekMapPromise) {
    mrPornGeekMapPromise = fetchSitemapLocs('https://www.mrporngeek.com/sitemap_index.xml')
      .then((indexUrls) => indexUrls.filter((url) => /sites-sitemap/i.test(url)))
      .then((siteSitemapUrls) => Promise.all(siteSitemapUrls.map(fetchSitemapLocs)))
      .then((chunks) => chunks.flat())
      .then((locs) => buildMapFromLocs(locs, (map, loc, parts) => {
        if (parts[0] !== 'review' || !parts[1]) return;
        addMapEntry(map, parts[1], loc);
      }));
  }

  return mrPornGeekMapPromise;
}

async function getPornInspectorMap() {
  if (!pornInspectorMapPromise) {
    pornInspectorMapPromise = fetchSitemapLocs('https://www.porninspector.com/sitemap.xml')
      .then((locs) => buildMapFromLocs(locs, (map, loc, parts) => {
        if (parts[0] !== 'reviews' || parts[1] !== 'review' || !parts[2]) return;
        addMapEntry(map, parts[2], loc.replace(/^http:\/\//i, 'https://'));
      }));
  }

  return pornInspectorMapPromise;
}

async function getPornDealsMap() {
  if (!pornDealsMapPromise) {
    pornDealsMapPromise = fetchSitemapLocs('https://porndeals.com/sitemap.xml')
      .then((locs) => buildMapFromLocs(locs, (map, loc, parts) => {
        if (parts[0] !== 'reviews' || !parts[1]) return;
        addMapEntry(map, parts[1], loc);
        // Many entries carry a "-network" suffix; index the bare slug too.
        addMapEntry(map, parts[1].replace(/-network$/, ''), loc);
      }));
  }

  return pornDealsMapPromise;
}

// ── CLI Parsing ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const forceMode = args.includes('--force');
const allMode = args.includes('--all');
const cliSiteArgs = args
  .filter((a) => a.startsWith('--site=') || a.startsWith('--sites='))
  .flatMap((a) => a.split('=')[1]?.split(',') ?? [])
  .map((a) => a.trim())
  .filter(Boolean);
const requestedSourceKeys = args
  .filter((a) => a.startsWith('--source='))
  .flatMap((a) => a.split('=')[1]?.split(',') ?? [])
  .map((a) => sourceKey(a.trim()))
  .filter(Boolean);
const positionalSlugs = args.filter((a) => !a.startsWith('--'));
const slugs = [...new Set([...positionalSlugs, ...cliSiteArgs])];

if (allMode && slugs.length > 0) {
  console.error('Use either --all or an explicit site list, not both.');
  process.exit(1);
}

if (!allMode && slugs.length === 0) {
  console.error('Usage: node scripts/discover-review-links.mjs [--all | slug1 slug2 ... | --site=slug | --sites=a,b] [--force] [--source=name]');
  process.exit(1);
}

const sourceLookup = new Map();
for (const source of SOURCES) {
  for (const key of [source.name, ...(source.aliases ?? [])].map(sourceKey)) {
    sourceLookup.set(key, source);
  }
}

const selectedSources = requestedSourceKeys.length > 0
  ? requestedSourceKeys.map((key) => sourceLookup.get(key)).filter(Boolean)
  : SOURCES;

if (requestedSourceKeys.length > 0 && selectedSources.length !== requestedSourceKeys.length) {
  const unknown = requestedSourceKeys.filter((key) => !sourceLookup.has(key));
  console.error(`Unknown source(s): ${unknown.join(', ')}`);
  console.error(`Available sources: ${SOURCES.map((source) => source.name).join(', ')}`);
  process.exit(1);
}

// ── Strapi Helpers ─────────────────────────────────────────────────────────────

async function fetchSites() {
  let page = 1;
  const pageSize = 100;
  const allSites = [];

  while (true) {
    const params = new URLSearchParams({
      'populate[0]': 'reviewSources',
      'populate[1]': 'platform',
      'filters[isActive][$eq]': 'true',
      'pagination[page]': String(page),
      'pagination[pageSize]': String(pageSize),
    });

    if (!allMode && slugs.length > 0) {
      slugs.forEach((slug, i) => {
        params.append(`filters[$or][${i}][slug][$eq]`, slug);
      });
    }

    const res = await fetch(`${STRAPI_URL}/api/sites?${params}`, { headers });
    if (!res.ok) throw new Error(`Failed to fetch sites page ${page}: ${res.status} ${await res.text()}`);

    const { data, meta } = await res.json();
    allSites.push(...data);

    if (page >= (meta?.pagination?.pageCount ?? 1)) break;
    page++;
  }

  return allSites;
}

async function updateSiteReviewSources(documentId, reviewSources) {
  const normalizedReviewSources = (reviewSources ?? []).map(({ sourceName, sourceUrl }) => ({
    sourceName,
    sourceUrl,
  }));

  const res = await fetch(`${STRAPI_URL}/api/sites/${documentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { reviewSources: normalizedReviewSources } }),
  });
  if (!res.ok) throw new Error(`Failed to update site ${documentId}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Probe / Search Helpers ─────────────────────────────────────────────────────

/**
 * Navigate to a URL and check if it's a valid review page (200 status + review content).
 * Returns true if valid, false otherwise.
 */
async function probeUrl(page, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    if (!response || response.status() >= 400) return false;
    const finalUrl = page.url();
    // Reject if we got redirected to homepage/404 page
    if (finalUrl !== url && (finalUrl.split('/').length < url.split('/').length - 1)) return false;
    const len = await page.evaluate(() => document.body?.innerText?.length || 0);
    if (len < 400) return false;
    const hasReview = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      const hits = ['review', 'rating', 'score', 'membership', 'subscription', 'content', 'quality'].filter(w => text.includes(w));
      return hits.length >= 3;
    });
    return hasReview;
  } catch {
    return false;
  }
}

/**
 * On the currently loaded page, find a link matching the site slug or name
 * whose href contains `urlFragment`.
 */
async function findMatchingLink(page, hrefPattern, slug, name) {
  const patternSrc = hrefPattern instanceof RegExp ? hrefPattern.source : hrefPattern;
  return page.evaluate(({ patternSrc, slug, name }) => {
    const re = new RegExp(patternSrc, 'i');
    const candidates = [...document.querySelectorAll('a[href]')]
      .map(a => ({ href: a.href, text: a.textContent?.trim().toLowerCase() || '' }))
      .filter(({ href }) => re.test(href));

    const lslug = slug.toLowerCase().replace(/-/g, '');
    const lname = name.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Score each candidate by similarity to slug/name
    const scored = candidates.map(({ href, text }) => {
      const urlLower = href.toLowerCase().replace(/-/g, '');
      const textLower = text.replace(/[^a-z0-9]/g, '');
      let score = 0;
      if (urlLower.includes(lslug)) score += 3;
      if (urlLower.includes(lname)) score += 3;
      if (textLower.includes(lslug)) score += 2;
      if (textLower.includes(lname)) score += 2;
      // partial match — site name words appear in URL
      const words = lname.match(/[a-z]{4,}/g) || [];
      words.forEach(w => { if (urlLower.includes(w)) score += 1; });
      return { href, score };
    }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);

    return scored[0]?.href || null;
  }, { patternSrc, slug, name });
}

/**
 * Navigate to `searchUrl`, wait for content, then look for a matching link.
 * `urlFragment` is a string that the matching href must contain.
 */
async function searchPageForLink(page, searchUrl, urlFragment, slug, name) {
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Extra wait for JS-heavy results
    await page.waitForTimeout(1500);
    const found = await findMatchingLink(page, urlFragment, slug, name);
    if (found && await probeUrl(page, found)) return found;
    return null;
  } catch {
    return null;
  }
}

// ── Main Discovery ─────────────────────────────────────────────────────────────

async function discoverLinks(page, site) {
  // Attach platform/network name for extra variant matching
  site.networkName = site.platform?.name || null;

  const found = [];
  for (const source of selectedSources) {
    let url = null;
    try {
      url = await source.findUrl(page, site);
    } catch (err) {
      console.log(`  ✗ ${source.name}: error — ${err.message.slice(0, 80)}`);
    }

    if (url) {
      found.push({ sourceName: source.name, sourceUrl: url });
      console.log(`  ✓ ${source.name}: ${url}`);
    } else {
      console.log(`  ✗ ${source.name}: not found`);
    }

    // Brief pause between sources
    await new Promise((r) => setTimeout(r, 1500));
  }
  return found;
}

function mergeReviewSources(existing, discovered) {
  const merged = [];
  const discoveredBySource = new Map(discovered.map((item) => [item.sourceName, item]));

  for (const source of existing ?? []) {
    const replacement = discoveredBySource.get(source.sourceName);
    if (replacement) {
      merged.push({
        id: source.id,
        ...replacement,
      });
      discoveredBySource.delete(source.sourceName);
    } else {
      merged.push(source);
    }
  }

  for (const source of discoveredBySource.values()) {
    merged.push(source);
  }

  return merged;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching sites from Strapi...');
  const sites = await fetchSites();
  console.log(`Found ${sites.length} site(s) to process.\n`);

  if (sites.length === 0) {
    console.log('No matching sites found.');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const page = await context.newPage();

  let processed = 0;
  let skipped = 0;
  let updated = 0;
  const noResults = [];

  for (const site of sites) {
    const existing = site.reviewSources ?? [];

    if (existing.length > 0 && !forceMode) {
      console.log(`⏭  ${site.name} — already has ${existing.length} source(s), skipping (use --force to overwrite)`);
      skipped++;
      continue;
    }

    console.log(`🔍 ${site.name} (${site.slug})`);
    const found = await discoverLinks(page, site);
    processed++;

    if (found.length === 0) {
      noResults.push(site.name);
      console.log(`  ⚠ No review links found for ${site.name}\n`);
      continue;
    }

    const nextSources = mergeReviewSources(existing, found);
    await updateSiteReviewSources(site.documentId, nextSources);
    updated++;
    const addedCount = nextSources.length - existing.length;
    const replacedCount = found.length - Math.max(0, addedCount);
    console.log(`  💾 Saved ${found.length} source(s) (${addedCount} added, ${replacedCount} refreshed)\n`);
  }

  await browser.close();

  // Summary
  console.log('\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Processed: ${processed} | Updated: ${updated} | Skipped: ${skipped}`);
  if (noResults.length > 0) {
    console.log(`\n⚠ No reviews found for: ${noResults.join(', ')}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

