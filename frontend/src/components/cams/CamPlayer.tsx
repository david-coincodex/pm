'use client';

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { getMuted, getServerMuted, setMuted, subscribeMuted } from '@/lib/cams/soundPref';
import { useTranslations } from 'next-intl';
import { VIDEO_PLUGINS } from '@/lib/cams/providers/video';
import type { CamModel } from '@/lib/cams/types';
import CamThumbFallback from './CamThumbFallback';

interface Props {
  model: CamModel;
  /** Resolved display name (the page falls back through registry values). */
  displayName: string;
  /** Server-counted affiliate redirect — the offline/no-stream fallback link. */
  outUrl: string;
}

/**
 * THE cam view on model pages — a HOST, not a player.
 *
 * The picture comes from the provider's video plugin (lib/cams/providers/video.ts): Chaturbate
 * hands over its own iframe (its stream is only resolvable from the visitor's IP — see memory
 * cb-stream-token-ip-bound), BongaCams plays a plain public m3u8 in our <video>, and a future
 * provider brings whatever surface it needs. This component owns everything that must be
 * IDENTICAL for every provider:
 *
 *   - the /out/ affiliate overlay, rendered whenever a surface is playing — derived from the
 *     contract, never from provider ids, so a new provider cannot silently stop monetizing;
 *   - the control bar (live dot · mute · fullscreen), rendered unless the plugin says it
 *     `ownsControls` (a cross-origin iframe or an SDK with its own bar);
 *   - the facade: thumb + play affordance over the counted redirect, for models that can't
 *     play and for any surface that reports a fatal error, so dead third-party playback code
 *     still earns the click.
 */
const subscribeFullscreen = (onChange: () => void) => {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
};
const subscribeNever = () => () => {};

export default function CamPlayer({ model, displayName, outUrl }: Props) {
  const { thumbUrl } = model;
  const plugin = VIDEO_PLUGINS[model.provider];
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

  // ONE decision: is a provider surface playing? Everything else derives from it, so no
  // provider-shaped booleans remain to forget about when a provider is added.
  const playing = plugin.canPlay(model) && !streamFailed;
  // Our bar only rides over surfaces that don't carry their own (see VideoPlugin.ownsControls).
  const showOwnBar = playing && !plugin.ownsControls;

  const onStreamFatal = useCallback(() => setStreamFailed(true), []);

  const toggleFullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen().catch(() => {});
  };

  return (
    <div ref={wrapperRef} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
      {playing ? (
        <plugin.Player
          model={model}
          muted={muted}
          poster={thumbUrl || undefined}
          onFatal={onStreamFatal}
        />
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
          working and only a click on the picture leaves; a provider iframe is fully covered, so
          its muted autoplay is a preview and any click goes to the provider through /out/. */}
      {playing && (
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
