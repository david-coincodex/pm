'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { mountImlivePlayer } from './sdk';
import type { PlayerProps } from '../video-types';

/**
 * ImLive's live room on a model page, through their HTML5 SDK (see ./sdk.ts for why the SDK is
 * the only live path and what was verified).
 *
 * The SDK renders its own sound button, which is why this plugin declares `ownsControls: true`
 * and the host keeps its bar off. Volume starts from the shared mute preference so a
 * sound-on visitor is not surprised.
 *
 * Any failure — blocked script, room already gone, chat closed — calls `onFatal`, and the host
 * swaps in the affiliate facade. That matters commercially: a dead third-party player must
 * still leave a clickable path to the provider.
 */
export default function ImlivePlayer({ model, muted, onFatal }: PlayerProps) {
  // Unique per mount: the SDK takes a DOM id, and two players must not fight over one node.
  const elementId = `imlive-player-${useId().replace(/[:]/g, '')}`;
  const [gestureNeeded, setGestureNeeded] = useState(false);
  const teardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    mountImlivePlayer({
      model,
      elementId,
      volume: muted ? 0 : 0.5,
      preview: false,
      soundButton: true,
      handlers: {
        onFail: (why) => {
          if (cancelled) return;
          console.warn(`[cams] imlive player failed: ${why}`);
          onFatal();
        },
        onNeedsGesture: () => !cancelled && setGestureNeeded(true),
        onStart: () => !cancelled && setGestureNeeded(false),
      },
    })
      .then((teardown) => {
        if (cancelled) return teardown();
        teardownRef.current = teardown;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn('[cams] imlive SDK unavailable:', err instanceof Error ? err.message : err);
        onFatal();
      });

    return () => {
      cancelled = true;
      teardownRef.current?.();
      teardownRef.current = null;
    };
    // Remount on a different room: the connection data is per-session, so a reconnected model
    // needs a fresh instance rather than a mutated one.
  }, [model.imliveRoom?.workingServer, model.username, elementId, muted, onFatal, model]);

  return (
    <>
      <div id={elementId} className="absolute inset-0 h-full w-full" />
      {/* Autoplay blocked with sound on: the SDK asks for a gesture, so say so quietly rather
          than leaving a frozen frame. Tapping anywhere on the picture also reaches the host's
          affiliate overlay, so this is informational, not a trap. */}
      {gestureNeeded && (
        <span className="pointer-events-none absolute inset-x-0 bottom-3 z-[15] text-center text-xs text-white/80">
          Tap to start
        </span>
      )}
    </>
  );
}
