/**
 * Head support for pages that render provider thumbnails: connection warmup + the
 * broken-image fallback. Belongs on EVERY page with cam thumbs — the live-sex layout covers
 * the browse surface, and pages outside it (the favorites page) must render it themselves,
 * or their dead thumbnails show the browser's broken-image glyph instead of the placeholder.
 */

/**
 * A listing paints ~50 thumbnails from these CDNs. Preconnecting while the HTML still streams
 * takes DNS + TCP + TLS off the grid's critical path. Deliberately NO crossorigin attribute:
 * the thumbs are plain <img> (no-CORS) requests, and browsers key connection reuse on the
 * credentials mode — a crossorigin-anonymous preconnect warms a socket that plain images can
 * never use, which is worse than no hint at all.
 */
const THUMB_HOSTS = ['https://thumb.live.mmcdn.com', 'https://i.bgicdn.com'];

/**
 * Broken-thumbnail handler.
 *
 * A cam thumbnail is a picture of a live video feed, so it stops existing the moment the model
 * logs off: Chaturbate answers 404 (it does NOT serve a last-known frame), and BongaCams
 * publishes thumbnails on hashed CDN paths that cannot be rebuilt from a username. Pages are
 * cached for up to a minute, so some cards on any given render WILL point at a dead image —
 * and the registry's last-seen thumb URLs (offline covers) go dead the same way.
 *
 * ONE capture-phase listener covers every thumbnail on the page — `error` events don't bubble,
 * but they do propagate downwards, so this stays O(1) no matter how many cards render. The
 * alternative (an onError prop) would mean turning all ~50 cards into client components for a
 * case that only affects a handful of them. It sets an attribute rather than swapping the src,
 * so React never fights it: `data-[broken]:opacity-0` on the img fades it out to the card's
 * own placeholder tile.
 */
const THUMB_FALLBACK_SCRIPT = `
(function(){
  if (window.__camThumbFallback) return;
  window.__camThumbFallback = 1;
  document.addEventListener('error', function(e){
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.hasAttribute('data-cam-thumb')) t.setAttribute('data-broken', '');
  }, true);
})();
`;

export default function CamThumbHead() {
  return (
    <>
      {THUMB_HOSTS.map((host) => (
        <link key={host} rel="preconnect" href={host} />
      ))}
      <script dangerouslySetInnerHTML={{ __html: THUMB_FALLBACK_SCRIPT }} />
    </>
  );
}
