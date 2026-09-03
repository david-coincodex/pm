'use client';

import { useEffect, useRef } from 'react';
import type Hls from 'hls.js';

/**
 * Card-sized muted HLS playback, moved VERBATIM out of components/cams/CamCardPreview.tsx when
 * previews became per-provider plugins. Distinct from shared/HlsSurface.tsx on purpose: a card
 * preview is always muted, has no control bar and no sound-store coupling.
 */

/** Minimal muted HLS playback for a card — no controls, lowest sensible quality. */
export function HlsPreview({ src, onFatal, onReady }: { src: string; onFatal: () => void; onReady: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | null = null;
    let cancelled = false;
    video.muted = true;
    const play = () => void video.play().catch(() => {});
    // 'playing' = frames are actually rendering — the loading bar's finish line.
    video.addEventListener('playing', onReady, { once: true });

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('error', onFatal);
      play();
    } else {
      void import('hls.js').then(({ default: HlsCtor }) => {
        if (cancelled) return;
        if (!HlsCtor.isSupported()) return onFatal();
        hls = new HlsCtor({
          liveSyncDurationCount: 3,
          maxBufferLength: 6,
          // A card is ~300px wide: cap the level to the element so previews stream 240p,
          // not the 720p a full player would pick.
          capLevelToPlayerSize: true,
          startLevel: 0,
        });
        hls.on(HlsCtor.Events.ERROR, (_e, data) => {
          if (data.fatal) onFatal(); // previews are disposable — no recovery dance, just vanish
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(HlsCtor.Events.MANIFEST_PARSED, play);
      });
    }

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeEventListener('error', onFatal);
      video.removeEventListener('playing', onReady);
      video.removeAttribute('src');
      video.load();
    };
  }, [src, onFatal, onReady]);

  return <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />;
}
