'use client';

import { useEffect, useRef } from 'react';
import type Hls from 'hls.js';
import { setMuted } from '@/lib/cams/soundPref';

/**
 * Shared HLS playback primitives for any provider whose feed hands out a plain m3u8.
 *
 * Moved VERBATIM out of components/cams/CamPlayer.tsx (and CamCardPreview.tsx) when the video
 * layer became per-provider plugins — same recovery counters, same autoplay-downgrade rules,
 * same cleanup. BongaCams uses both today; a future HLS provider reuses them instead of
 * copying playback logic.
 */

/** Chromeless HLS playback — mute is owned by the host's control bar, nothing floats here. */
export function HlsSurface({
  src,
  poster,
  muted,
  onFatal,
}: {
  src: string;
  poster?: string;
  muted: boolean;
  onFatal: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Recovery attempts per error class — a dead stream must not loop startLoad forever. */
  const MAX_RECOVERIES = 2;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | null = null;
    let cancelled = false;
    // Audible autoplay needs a user gesture. A returning visitor's saved sound-on preference
    // unmutes BEFORE any click, and the browser then blocks playback — muted playback always
    // wins over none. ONLY NotAllowedError downgrades: any other rejection (e.g. the no-src
    // NotSupportedError from the [muted] effect racing this one before hls attaches) must not
    // force-mute a browser that would have allowed sound. The downgrade flips the SHARED
    // store non-persistently so the buttons show the truth ("Unmute") while the saved
    // preference survives for the next page.
    const downgradeToMuted = () => {
      video.muted = true;
      void video.play().catch(() => {});
      setMuted(true, { persist: false });
    };
    const play = () =>
      void video.play().catch((err: unknown) => {
        if (!video.muted && (err as Error)?.name === 'NotAllowedError') downgradeToMuted();
      });
    const onNativeError = () => onFatal();

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('error', onNativeError);
      play();
    } else {
      void import('hls.js').then(({ default: HlsCtor }) => {
        if (cancelled) return;
        if (!HlsCtor.isSupported()) return onFatal();
        hls = new HlsCtor({ liveSyncDurationCount: 3, maxBufferLength: 10 });
        const recoveries = { network: 0, media: 0 };
        hls.on(HlsCtor.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && recoveries.network < MAX_RECOVERIES) {
            recoveries.network += 1;
            hls?.startLoad();
          } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && recoveries.media < MAX_RECOVERIES) {
            recoveries.media += 1;
            hls?.recoverMediaError();
          } else {
            console.warn('[cams] live stream failed fatally (network/media) — if requests to the provider CDN (mmcdn.com / bcvcdn.com) show as blocked, an ad/privacy blocker is eating the stream', data.details);
            onFatal();
          }
        });
        hls.on(HlsCtor.Events.MANIFEST_PARSED, (_e, data) => {
          if (!hls) return;
          // Mid-ladder start (480p on the usual 240/480/720 set), clamped to what exists —
          // safe here: hls.js delivers MANIFEST_PARSED to all handlers before auto-starting.
          hls.startLevel = Math.min(1, data.levels.length - 1);
          play();
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      });
    }

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeEventListener('error', onNativeError);
      video.removeAttribute('src');
      video.load();
    };
  }, [src, onFatal]);

  // The control bar owns mute state; the element just follows it (survives src reloads too).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (!muted) {
      void video.play().catch((err: unknown) => {
        // Blocked audible autoplay (saved preference, no gesture yet): stay muted and
        // PLAYING, and let the shared store reflect it (non-persisted — see above).
        if ((err as Error)?.name === 'NotAllowedError') {
          video.muted = true;
          void video.play().catch(() => {});
          setMuted(true, { persist: false });
        }
      });
    }
  }, [muted]);

  return (
    <video
      ref={videoRef}
      className="absolute inset-0 h-full w-full object-contain"
      poster={poster}
      autoPlay
      muted
      playsInline
    />
  );
}
