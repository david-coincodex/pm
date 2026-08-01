/**
 * Shared playback control for the ad clips.
 *
 * A "Best 20" article holds ~20 silent looping clips. Two things have to be true:
 *
 *  1. **Nothing downloads until intent is proven.** The `src` is held in `data-src` and only
 *     assigned on hover / scroll-into-view, so an untouched page transfers zero video bytes.
 *  2. **Only a couple play at once.** Scrolling puts 5–8 clips in the viewport
 *     simultaneously; mid-range Android hits hardware-decoder limits and degrades to a
 *     slideshow. The cap lives at module scope (not component state) because it has to be
 *     global across every player on the page.
 */

const MAX_CONCURRENT = 2;

/** Insertion-ordered, so the oldest playing clip is the one evicted. */
const playing = new Set<HTMLVideoElement>();

/** Start playback, loading the source on first use and evicting older clips past the cap. */
export function requestPlay(el: HTMLVideoElement | null): void {
  if (!el || playing.has(el)) return;

  while (playing.size >= MAX_CONCURRENT) {
    const oldest = playing.values().next().value;
    if (!oldest) break;
    release(oldest);
  }

  // React does not reliably emit the `muted` *attribute* during hydration, so the property
  // can still be false when play() runs — and Chrome rejects unmuted autoplay. Set it
  // imperatively every time. (The clips also have no audio track at all, which exempts them
  // from the gesture requirement entirely; this is the second layer.)
  el.muted = true;

  if (!el.getAttribute('src') && el.dataset.src) el.src = el.dataset.src;

  playing.add(el);
  // play() rejects with NotAllowedError (policy) and AbortError (a pause racing a play).
  // Unhandled, those surface as console noise on every hover.
  el.play().catch(() => playing.delete(el));
}

/**
 * Pause and rewind. `hard` also drops the source, freeing the decoder and buffered data —
 * use it when a clip leaves the viewport, but not on hover-out, so re-hover replays from
 * the HTTP cache instead of refetching.
 */
export function release(el: HTMLVideoElement | null, hard = false): void {
  if (!el) return;
  playing.delete(el);
  el.pause();
  try {
    el.currentTime = 0;
  } catch {
    // Safari throws if metadata isn't loaded yet; nothing to rewind in that case.
  }
  if (hard) {
    el.removeAttribute('src');
    el.load();
  }
}

/** True when the visitor has asked for reduced motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True for real pointers (mouse/trackpad). Touch devices have no hover to preview with. */
export function isHoverCapable(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/** True on metered or very slow connections — don't spend the visitor's data unasked. */
export function isSavingData(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!conn) return false;
  return Boolean(conn.saveData) || ['slow-2g', '2g'].includes(conn.effectiveType ?? '');
}

/** Should we auto-play at all (hover preview or scroll-into-view)? */
export function autoplayAllowed(): boolean {
  return !prefersReducedMotion() && !isSavingData();
}
