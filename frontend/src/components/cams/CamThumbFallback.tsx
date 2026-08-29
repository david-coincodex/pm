/**
 * What a card shows when there is no thumbnail to show.
 *
 * A cam thumbnail is a frame grabbed from a live stream, so it exists only while the model is
 * broadcasting: Chaturbate's URL 404s the second they log off, and BongaCams publishes theirs
 * on hashed CDN paths that can't be rebuilt from a username. There is no "last known cover" to
 * fall back to at either provider — so rather than a broken-image glyph, an offline model gets
 * a deliberate placeholder carrying its initial.
 *
 * Sits BEHIND the <img> in the same box: while the thumb loads it is the backdrop, and if the
 * thumb turns out to be dead the image fades to transparent and this is what remains.
 *
 * "Behind" is doing real work here. This element is absolutely positioned, so it paints above
 * any statically-positioned sibling no matter what the DOM order says — the thumbnail must
 * ALSO be positioned (absolute inset-0) or it renders underneath and the grid looks empty.
 * Every caller passes it first and the image second, so painting order follows DOM order.
 */
export default function CamThumbFallback({ displayName }: { displayName: string }) {
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900"
      aria-hidden="true"
    >
      <span className="text-2xl font-black text-slate-400 dark:text-slate-600">{initial}</span>
      <svg className="h-4 w-4 text-slate-300 dark:text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M3 3l18 18M5 7h6a2 2 0 012 2v6M9 17H5a2 2 0 01-2-2V9" />
      </svg>
    </div>
  );
}
