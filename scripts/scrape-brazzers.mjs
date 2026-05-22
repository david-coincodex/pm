#!/usr/bin/env node
/**
 * Scrape Brazzers channels from https://www.brazzers.com/sites
 * and populate Strapi subsites linked to the Brazzers site entry.
 *
 * Requirements:
 *   cd scripts && npm install && npx playwright install chromium
 *
 * Usage:
 *   STRAPI_ADMIN_EMAIL=admin@example.com \
 *   STRAPI_ADMIN_PASSWORD=yourpass \
 *   node scripts/scrape-brazzers.mjs
 *
 * Optional:
 *   STRAPI_URL=http://localhost:1339   (default)
 *   BRAZZERS_SITE_SLUG=brazzers        (default)
 *   DRY_RUN=1                          skip Strapi writes, just print scraped data
 */

import { chromium } from 'playwright';
import { createReadStream } from 'fs';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1339';
const STRAPI_EMAIL = process.env.STRAPI_ADMIN_EMAIL;
const STRAPI_PASSWORD = process.env.STRAPI_ADMIN_PASSWORD;
const STRAPI_TOKEN = process.env.STRAPI_TOKEN; // API token (takes precedence over email/password)
const BRAZZERS_SLUG = process.env.BRAZZERS_SITE_SLUG || 'brazzers';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!DRY_RUN && !STRAPI_TOKEN && (!STRAPI_EMAIL || !STRAPI_PASSWORD)) {
  console.error('Error: provide STRAPI_TOKEN or both STRAPI_ADMIN_EMAIL and STRAPI_ADMIN_PASSWORD.');
  console.error('Use DRY_RUN=1 to scrape without writing to Strapi.');
  process.exit(1);
}

// ── Strapi helpers ─────────────────────────────────────────────────────────────

async function strapiLogin() {
  if (STRAPI_TOKEN) return STRAPI_TOKEN;
  const res = await fetch(`${STRAPI_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: STRAPI_EMAIL, password: STRAPI_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Strapi login failed: ${res.status} ${await res.text()}`);
  const { data } = await res.json();
  return data.token;
}

async function findSiteBySlug(token, slug) {
  const res = await fetch(
    `${STRAPI_URL}/api/sites?filters[slug][$eq]=${slug}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const { data } = await res.json();
  return data?.[0] ?? null;
}

async function subsiteExists(token, slug) {
  const res = await fetch(
    `${STRAPI_URL}/api/subsites?filters[slug][$eq]=${encodeURIComponent(slug)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const { data } = await res.json();
  return (data?.length ?? 0) > 0;
}

async function uploadImage(token, imageUrl, filename) {
  // Download image to temp file
  const res = await fetch(imageUrl);
  if (!res.ok) return null;

  const buf = Buffer.from(await res.arrayBuffer());
  const tmpPath = path.join(tmpdir(), filename);
  await writeFile(tmpPath, buf);

  try {
    const form = new FormData();
    const blob = new Blob([buf], { type: res.headers.get('content-type') || 'image/jpeg' });
    form.append('files', blob, filename);

    const uploadRes = await fetch(`${STRAPI_URL}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!uploadRes.ok) return null;
    const [file] = await uploadRes.json();
    return file?.id ?? null;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

async function createSubsite(token, { name, slug, description, siteDocumentId, logoId, coverId }) {
  const body = {
    data: {
      name,
      slug,
      isActive: true,
      site: siteDocumentId,
      ...(description && {
        description: [{ type: 'paragraph', children: [{ type: 'text', text: description }] }],
      }),
      ...(logoId && { logo: logoId }),
      ...(coverId && { cover_image: coverId }),
    },
  };

  const res = await fetch(`${STRAPI_URL}/api/subsites`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Create subsite "${name}" failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Scraper ────────────────────────────────────────────────────────────────────

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 800;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 400);
    });
  });
}

async function scrapeChannels() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  try {
    console.log('→ Loading https://www.brazzers.com/sites …');
    await page.goto('https://www.brazzers.com/sites', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Dismiss age gate if present
    try {
      const enterBtn = page.getByText('Enter', { exact: true });
      if (await enterBtn.isVisible({ timeout: 6_000 })) {
        console.log('  Dismissing age gate…');
        await enterBtn.click();
        await page.waitForLoadState('networkidle', { timeout: 10_000 });
      }
    } catch {}

    // Accept cookies
    try {
      const acceptBtn = page.getByText('ACCEPT ALL COOKIES');
      if (await acceptBtn.isVisible({ timeout: 4_000 })) {
        await acceptBtn.click();
        await page.waitForTimeout(1_000);
      }
    } catch {}

    await page.waitForTimeout(2_000);
    console.log('  Scrolling to load all channels…');
    await autoScroll(page);
    await page.waitForTimeout(2_000);

    const channels = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Anchor point: every "View all" link sits inside a channel block
      const viewAllLinks = Array.from(document.querySelectorAll('a')).filter(
        (a) => /^view\s+all$/i.test(a.textContent?.trim() ?? '')
      );

      for (const link of viewAllLinks) {
        const href = link.getAttribute('href') || '';
        if (!href) continue;

        // Build a clean slug from the href path
        const pathPart = href.replace(/^https?:\/\/[^/]+/, '');
        const rawSlug = pathPart
          .replace(/^\/site\/\d+\//, '/')
          .replace(/^\//, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        if (!rawSlug || seen.has(rawSlug)) continue;
        seen.add(rawSlug);

        // Walk up to find a container that has both a channel name and a description
        let container = link.parentElement;
        let name = '';
        let description = '';
        let logoUrl = '';
        let coverUrl = '';

        for (let depth = 0; depth < 12 && container; depth++) {
          // Look for channel name – usually a heading or bold span with channel text
          // Exclude page-level headings that contain "BRAZZERS CHANNELS"
          if (!name) {
            const headings = container.querySelectorAll('h1,h2,h3,h4,[class*="title"],[class*="name"],[class*="Title"],[class*="Name"]');
            for (const h of headings) {
              const t = h.textContent?.trim();
              if (
                t && t.length >= 3 && t.length <= 60 &&
                !/^view\s*all$/i.test(t) &&
                !/brazzers\s+channels/i.test(t) &&
                !/browse\s+our/i.test(t)
              ) {
                name = t;
                break;
              }
            }
          }

          // Look for description paragraph
          if (!description) {
            const paras = container.querySelectorAll('p');
            const longPara = Array.from(paras).find(
              (p) => (p.textContent?.trim().length || 0) > 40
            );
            if (longPara) description = longPara.textContent?.trim().substring(0, 600) ?? '';
          }

          // Look for images
          if (!logoUrl || !coverUrl) {
            const imgs = container.querySelectorAll('img[src]');
            for (const img of imgs) {
              const src = img.getAttribute('src') || '';
              if (!src || src.startsWith('data:')) continue;
              const alt = img.getAttribute('alt') || '';
              // Banner/cover images are usually wider than tall
              if (!coverUrl && (alt.toLowerCase().includes('banner') || img.width > img.height * 1.5)) {
                coverUrl = src;
              } else if (!logoUrl) {
                logoUrl = src;
              }
            }
          }

          if (name && description) break;
          container = container.parentElement;
        }

        if (!name) {
          // Fallback: derive name from slug, preserving known acronyms
          const acronyms = new Set(['zz', 'milfs', 'milf']);
          name = rawSlug
            .split('-')
            .map((w) => acronyms.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        }

        results.push({ name, slug: rawSlug, description, logoUrl, coverUrl, href });
      }

      return results;
    });

    console.log(`  Found ${channels.length} channels.`);
    return channels;
  } finally {
    await browser.close();
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const channels = await scrapeChannels();

  if (DRY_RUN) {
    console.log('\nDRY RUN – scraped data:');
    console.log(JSON.stringify(channels, null, 2));
    return;
  }

  console.log('\n→ Authenticating with Strapi…');
  const token = await strapiLogin();

  console.log(`→ Looking up site "${BRAZZERS_SLUG}"…`);
  const brazzersSite = await findSiteBySlug(token, BRAZZERS_SLUG);
  if (!brazzersSite) {
    console.error(`✗ Site with slug "${BRAZZERS_SLUG}" not found in Strapi. Create it first.`);
    process.exit(1);
  }
  const siteDocumentId = brazzersSite.documentId;
  console.log(`  Found: ${brazzersSite.name} (documentId: ${siteDocumentId})`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const ch of channels) {
    process.stdout.write(`  ${ch.name} (${ch.slug}) … `);

    if (await subsiteExists(token, ch.slug)) {
      console.log('skip (already exists)');
      skipped++;
      continue;
    }

    try {
      // Upload images
      let logoId = null;
      let coverId = null;

      if (ch.logoUrl) {
        const ext = ch.logoUrl.split('.').pop()?.split('?')[0] || 'jpg';
        logoId = await uploadImage(token, ch.logoUrl, `${ch.slug}-logo.${ext}`);
      }
      if (ch.coverUrl && ch.coverUrl !== ch.logoUrl) {
        const ext = ch.coverUrl.split('.').pop()?.split('?')[0] || 'jpg';
        coverId = await uploadImage(token, ch.coverUrl, `${ch.slug}-cover.${ext}`);
      }

      await createSubsite(token, {
        name: ch.name,
        slug: ch.slug,
        description: ch.description,
        siteDocumentId,
        logoId,
        coverId,
      });

      console.log('✓ created');
      created++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Created: ${created}  Skipped: ${skipped}  Failed: ${failed}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
