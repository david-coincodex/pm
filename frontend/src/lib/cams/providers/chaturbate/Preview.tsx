'use client';

import type { PreviewProps } from '../video-types';

/**
 * Chaturbate card preview: the provider's own embed, same URL as the model page.
 *
 * It can't be muted programmatically (cross-origin), but `disable_sound=1` in embedUrl starts
 * it silent, and the host's holder is `pointer-events-none` so clicks fall through to the
 * card's link and a visitor can never unmute a preview.
 *
 * The 16:9 stream is LETTERBOXED (full width, centered on black) inside the 4:3 card rather
 * than filling it: an iframe can't be object-fit, so filling would make the provider's player
 * crop the frame — the "zoomed in" look. Bars show the whole scene instead.
 */
export default function ChaturbatePreview({ model, onReady }: PreviewProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <iframe
        src={model.embedUrl}
        title=""
        aria-hidden="true"
        tabIndex={-1}
        scrolling="no"
        allow="autoplay"
        className="aspect-video w-full border-0"
        onLoad={onReady}
      />
    </div>
  );
}
