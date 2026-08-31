'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getMuted, getServerMuted, setMuted, subscribeMuted } from '@/lib/cams/soundPref';
import { useTranslations } from 'next-intl';
import type Hls from 'hls.js';
import CamThumbFallback from './CamThumbFallback';

interface Props {
  embedUrl: string;
  thumbUrl: string;
  displayName: string;
  /** False for providers that refuse framing (BongaCams sends X-Frame-Options: SAMEORIGIN). */
  canEmbed: boolean;
  /** HLS live stream — the playback path for providers that refuse framing. */
  streamUrl?: string;
  /** Server-counted affiliate redirect — the offline/no-stream fallback link. */
  outUrl: string;
}

/**
 * THE cam view on model pages. The two providers take different playback surfaces because
 * their streams have different constraints:
 *
 *   HLS    — BongaCams' feed hands out a PLAIN public m3u8 (no token), so it plays in OUR
 *            chromeless <video> with our own control bar (live dot · mute · fullscreen).
 *   iframe — Chaturbate's stream is only resolvable/playable from the VISITOR'S own IP: the
 *            tokenized playlist is bound to whoever resolved it, and the datacenter VPS is in
 *            fact BLOCKED from resolving it at all (Cloudflare datacenter challenge — verified
 *            on staging: rooms that resolve from a residential IP return null from the VPS).
 *            So we hand Chaturbate its own embed_video_only player in an iframe: the browser
 *            resolves + plays it, it carries NO chat, and it autoplays muted (disable_sound=1
 *            in embedUrl). The player owns its audio and fullscreen — a cross-origin iframe is
 *            unreachable from our sound store, so we do NOT overlay our bar on it.
 *   link   — BongaCams offline/streamless: thumb + play affordance via the counted redirect.
 *
 * (History: Chaturbate briefly played through our <video> via a server-side HLS resolve. That
 * works in dev only because the container and browser share one NAT IP; it fails in production.
 * See memory cb-stream-token-ip-bound. Matching lemoncams' custom muted player would need a
 * paid residential-proxy resolve path — deferred.)
 */
const subscribeFullscreen = (onChange: () => void) => {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
};
const subscribeNever = () => () => {};

export default function CamPlayer({ embedUrl, thumbUrl, displayName, canEmbed, streamUrl, outUrl }: Props) {
  const t = useTranslations('liveSex');
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Shared sound store (header button + this player + the bar toggle all drive it): defaults
  // muted, persists an unmute so the NEXT stream starts with sound. Server snapshot is muted,
  // so a returning sound-on visitor flips (and the iframe reloads) right after hydration.
  const muted = useSyncExternalStore(subscribeMuted, getMuted, getServerMuted);
  const [streamFailed, setStreamFailed] = useState(false);
  // External browser state read via the store hook: SSR snapshots say "no fullscreen", the
  // client re-reads after hydration — no effect-driven setState, no hydration mismatch.
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => Boolean(document.fullscreenElement),
    () => false,
  );
  const fullscreenSupported = useSyncExternalStore(
    subscribeNever,
    () => Boolean(document.fullscreenEnabled),
    () => false,
  );

  // Chaturbate (canEmbed) → its own iframe player; BongaCams → our <video>. See the header note.
  const isIframeProvider = canEmbed && embedUrl.length > 0;
  const effectiveStream = !isIframeProvider && !streamFailed ? streamUrl : undefined;
  const canStream = Boolean(effectiveStream);
  // Our control bar only rides over OUR <video> (BongaCams). The Chaturbate iframe carries its
  // own controls; overlaying ours would just mask them with a mute button that can't reach it.
  const showOwnBar = canStream;

  const onStreamFatal = useCallback(() => setStreamFailed(true), []);

  const toggleFullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen().catch(() => {});
  };

  return (
    <div ref={wrapperRef} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
      {isIframeProvider ? (
        /* Chaturbate's bare-stream player: no chat, no room UI, autoplays muted (disable_sound=1
           lives in embedUrl). The visitor's browser resolves and plays it, so it works cross-IP
           where our server-side resolve cannot. Its own slim bar owns mute/fullscreen. */
        <iframe
          src={embedUrl}
          title={displayName}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          scrolling="no"
        />
      ) : canStream ? (
        <HlsSurface src={effectiveStream!} poster={thumbUrl || undefined} muted={muted} onFatal={onStreamFatal} />
      ) : (
        <a
          href={outUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="group absolute inset-0 block h-full w-full"
          aria-label={t('watchOnProvider', { name: displayName })}
        >
          <CamThumbFallback displayName={displayName} />
          {thumbUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={thumbUrl}
              alt={displayName}
              data-cam-thumb=""
              className="absolute inset-0 h-full w-full object-cover opacity-90 transition group-hover:opacity-100 data-[broken]:opacity-0"
            />
          )}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600/90 text-white shadow-lg transition group-hover:scale-110 group-hover:bg-emerald-500">
              <svg className="ml-1 h-8 w-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm">
              {t('watchOnProvider', { name: displayName })}
            </span>
          </span>
        </a>
      )}

      {/* Monetize clicks on the LIVE embed: a transparent overlay to the /out/ affiliate
          redirect (counted server-side, template-built) — the same money path as the CTA and
          the offline facade. Only over the PLAYING surfaces; the offline branch is already an
          /out/ link. BongaCams' control bar sits ABOVE this (z-20) so mute/fullscreen keep
          working and only a click on the picture leaves; the Chaturbate iframe is fully covered,
          so its muted autoplay is a preview and any click goes to the provider through /out/. */}
      {(isIframeProvider || canStream) && (
        <a
          href={outUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label={t('watchOnProvider', { name: displayName })}
          className="absolute inset-0 z-10"
        />
      )}

      {showOwnBar && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-8">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
            {t('live')}
          </span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMuted(!muted)}
              aria-label={muted ? t('unmute') : t('mute')}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              {muted ? (
                <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H3v6h3l5 4V5zM22 9l-6 6m0-6l6 6" />
                </svg>
              ) : (
                <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 010 7M18.4 5.6a9 9 0 010 12.8" />
                </svg>
              )}
            </button>
            {fullscreenSupported && (
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={t('fullscreen')}
                aria-pressed={isFullscreen}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                {isFullscreen ? (
                  <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5" />
                  </svg>
                ) : (
                  <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5" />
                  </svg>
                )}
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/** Chromeless HLS playback — mute is owned by the control bar above, nothing floats here. */
function HlsSurface({
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
