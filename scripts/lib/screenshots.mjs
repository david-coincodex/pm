/**
 * Playwright screenshot capture for the launch-announcement generator
 * (scripts/generate-launch-article.mjs).
 *
 * Chromium ships with the scripts/ Playwright install (binaries under
 * ~/Library/Caches/ms-playwright). Shots are of the LIVE /live-sex/ pages on the local
 * frontend, whose grids show live cam thumbnails — so captures are NSFW by nature (this is
 * an adult site, and that is the point of the announcement).
 */
import { join } from 'path';
import { chromium } from 'playwright';

const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 2; // crisp @2x — Strapi generates the smaller responsive resizes from this

/**
 * Capture a list of shots from the frontend into outDir.
 *
 * @param {object} opts
 * @param {string} opts.frontend  base URL, e.g. http://localhost:3002
 * @param {string} opts.outDir    directory to write PNGs into (must exist)
 * @param {Array<{name:string, path:string, waitFor?:string, settleMs?:number}>} opts.shots
 * @returns {Promise<Map<string,{file:string,width:number,height:number}>>}  keyed by shot.name
 */
export async function captureShots({ frontend, outDir, shots }) {
  const browser = await chromium.launch({ headless: true });
  const out = new Map();
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
    const page = await context.newPage();
    for (const shot of shots) {
      const url = `${frontend}${shot.path}`;
      // networkidle can never fully settle on a live feed; cap it and move on.
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {});
      if (shot.waitFor) {
        await page.waitForSelector(shot.waitFor, { timeout: 20_000 }).catch(() => {});
      }
      // Let thumbnails paint / the player poster or iframe spin up.
      await page.waitForTimeout(shot.settleMs ?? 3_000);
      const file = join(outDir, `${shot.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      out.set(shot.name, { file, width: VIEWPORT.width * SCALE, height: VIEWPORT.height * SCALE });
      console.log(`  📸 ${shot.name} <- ${shot.path}`);
    }
  } finally {
    await browser.close();
  }
  return out;
}

/**
 * Pull the first live model URL out of the hub HTML so the model-page shot points at a room
 * that is actually online right now (inventory rotates constantly).
 * Returns a path like `/live-sex/chaturbate/<user>/`, or null if none found.
 */
export async function firstLiveModelPath(frontend) {
  const res = await fetch(`${frontend}/live-sex/`).catch(() => null);
  if (!res || !res.ok) return null;
  const html = await res.text();
  const m = html.match(/\/live-sex\/(chaturbate|bongacams)\/[A-Za-z0-9_.-]+\//);
  return m ? m[0] : null;
}
