/**
 * The standard article cover for generated posts: the PornMode wordmark centered with the
 * publish date in grey below it. Deliberately IDENTICAL between articles except the date —
 * one consistent brand card instead of per-article typographic layouts (user decision,
 * 2026-09: earlier headline/kicker/subtitle covers were retired).
 *
 * There is no PornMode logo IMAGE in the repo — the brand is text ("Porn" + emerald "Mode",
 * font-black; see frontend/src/components/NavMenu.tsx). So the cover is rendered as an SVG and
 * rasterized to PNG with sharp (root node_modules). 1200×630 = the standard OG/Twitter card.
 *
 * sharp renders SVG text via libvips+fontconfig; Helvetica/Arial are present on macOS. If a
 * host lacks them the text would fall back to a default sans — verify the output in --dry-run.
 */
import sharp from 'sharp';

const W = 1200;
const H = 630;
const EMERALD = '#10b981'; // Tailwind emerald-500, the site accent
const FONT = 'Helvetica, Arial, sans-serif';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * @param {object} opts
 * @param {string} opts.outFile
 * @param {Date}   [opts.date]  publish date shown under the wordmark (defaults to today)
 * @returns {Promise<{file:string,width:number,height:number}>}
 */
export async function buildCover({ outFile, date = new Date() }) {
  const dateText = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  // Both lines centered as a block: the wordmark sits just above the canvas midline, the date
  // below it. The wordmark is one <text> so "Porn"/"Mode" kerning stays a single run.
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#020617"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- wordmark -->
  <text x="${W / 2}" y="${H / 2 + 10}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="110" letter-spacing="-4">
    <tspan fill="#f8fafc">Porn</tspan><tspan fill="${EMERALD}">Mode</tspan>
  </text>

  <!-- date -->
  <text x="${W / 2}" y="${H / 2 + 80}" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="32" fill="#94a3b8">${esc(dateText)}</text>
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile(outFile);
  return { file: outFile, width: W, height: H };
}
