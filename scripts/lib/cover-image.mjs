/**
 * Typographic announcement cover for the launch-article generator.
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
 * @param {string} [opts.headline]
 * @param {string} [opts.kicker]
 * @param {string} [opts.subtitle]
 * @returns {Promise<{file:string,width:number,height:number}>}
 */
export async function buildCover({
  outFile,
  headline = 'Live Sex Cams',
  kicker = 'NOW LIVE',
  subtitle = 'Chaturbate & BongaCams · thousands of models · free live previews',
}) {
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#020617"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.12" r="0.7">
      <stop offset="0" stop-color="${EMERALD}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${EMERALD}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- wordmark -->
  <text x="80" y="150" font-family="${FONT}" font-weight="900" font-size="60" letter-spacing="-2">
    <tspan fill="#f8fafc">Porn</tspan><tspan fill="${EMERALD}">Mode</tspan>
  </text>

  <!-- kicker pill -->
  <rect x="80" y="238" width="176" height="44" rx="22" fill="${EMERALD}"/>
  <circle cx="108" cy="260" r="7" fill="#052e16"/>
  <text x="126" y="268" font-family="${FONT}" font-weight="800" font-size="22" letter-spacing="2" fill="#052e16">${esc(kicker)}</text>

  <!-- headline -->
  <text x="76" y="410" font-family="${FONT}" font-weight="900" font-size="104" letter-spacing="-4" fill="#ffffff">${esc(headline)}</text>

  <!-- subtitle -->
  <text x="80" y="480" font-family="${FONT}" font-weight="500" font-size="30" fill="#94a3b8">${esc(subtitle)}</text>

  <!-- accent underline -->
  <rect x="80" y="520" width="150" height="8" rx="4" fill="${EMERALD}"/>
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile(outFile);
  return { file: outFile, width: W, height: H };
}
