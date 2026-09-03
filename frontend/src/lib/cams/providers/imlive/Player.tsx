'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { isTerminalClose, mountImlivePlayer, type ImlivePlayerHandle } from './sdk';
import { useLiveRecovery } from './useLiveRecovery';
import type { PlayerProps } from '../video-types';

/** Start-of-stream loudness when unmuted — half volume, same polite default as anywhere. */
const DEFAULT_VOLUME = 0.5;

/**
 * Rebuild attempts for an AMBIGUOUS interruption before we give up and show the facade. Kept
 * small deliberately: their gateway answers `accessDenied` to a burst of reconnects.
 */
const RECOVERY_LIMIT = 2;

/**
 * ImLive's live room on a model page, through their HTML5 SDK (see ./sdk.ts for why the SDK is
 * the only live path and what was verified).
 *
 * Sound is OURS: the SDK's own button is suppressed and the shared mute store drives
 * setVolume() on the live instance — so imLive wears the host's bar and the header toggle
 * exactly like the same-origin surfaces (`ownsControls: false` in meta). The unmute click is
 * also forwarded as the SDK's documented user gesture, which is what lets a stream the browser
 * forced to start silent go audible without a rebuild.
 *
 * Any failure — blocked script, room already gone, chat closed — calls `onFatal`, and the host
 * swaps in the affiliate facade. That matters commercially: a dead third-party player must
 * still leave a clickable path to the provider.
 *
 * MOUNT DISCIPLINE: mounting is expensive (a script load, a gateway handshake and a comms
 * connection), and re-running the effect tears the live stream down mid-watch. So the effect
 * depends ONLY on facts that genuinely require a new instance — the room's connection data and
 * an explicit remount — while values that change with a parent re-render (the callback, the
 * mute preference, the model object's identity) are read through refs. `generation` is the one
 * deliberate remount trigger; see useLiveRecovery for why one is needed at all.
 */
export default function ImlivePlayer({ model, muted, onFatal }: PlayerProps) {
  // Unique per mount: the SDK takes a DOM id, and two players must not fight over one node.
  const elementId = `imlive-player-${useId().replace(/[:]/g, '')}`;
  const [gestureNeeded, setGestureNeeded] = useState(false);
  // Mirrors gestureNeeded for the mute effect: userGesture() literally re-requests the stream
  // in their SDK (requireH5Stream/requirePLSstream, unconditional), so calling it on a healthy
  // instance KILLS live playback — it may only fire when the SDK actually asked for a gesture.
  const gestureNeededRef = useRef(false);
  const [generation, setGeneration] = useState(0);
  const handleRef = useRef<ImlivePlayerHandle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Recovery attempts since playback last succeeded — a bound against a rebuild loop. */
  const recoveriesRef = useRef(0);

  // Their SDK pauses on tab-hide and resumes a live stream from a stale buffer, and a
  // backgrounded tab can lose the room outright. Both get a fresh instance; see the hook.
  const readVideo = useCallback(() => containerRef.current?.querySelector('video'), []);
  const remount = useCallback(() => setGeneration((g) => g + 1), []);
  const recovery = useLiveRecovery(readVideo, remount);

  const modelRef = useRef(model);
  const mutedRef = useRef(muted);
  const onFatalRef = useRef(onFatal);
  // Synced in an effect, not during render (React forbids touching ref.current while
  // rendering). Declared above the mount effect so it runs first on every commit.
  useEffect(() => {
    modelRef.current = model;
    mutedRef.current = muted;
    onFatalRef.current = onFatal;
  });

  useEffect(() => {
    let cancelled = false;
    mountImlivePlayer({
      model: modelRef.current,
      elementId,
      volume: mutedRef.current ? 0 : DEFAULT_VOLUME,
      preview: false,
      // Suppressed: the host bar and header button own sound (see the header comment).
      soundButton: false,
      handlers: {
        onFail: (why) => {
          if (cancelled) return;
          // An AMBIGUOUS close while the tab is hidden (or moments after it returns) is the
          // backgrounding, not a model who left: rebuild instead of handing the visitor a
          // permanent affiliate facade. A reason that names the room as gone is taken at its
          // word — retrying one of those is what earned an `accessDenied` in testing.
          if (!isTerminalClose(why) && recovery.interrupted() && recoveriesRef.current < RECOVERY_LIMIT) {
            recoveriesRef.current += 1;
            console.warn(`[cams] imlive interrupted while backgrounded (${why}) — rebuilding`);
            recovery.recover();
            return;
          }
          console.warn(`[cams] imlive player failed: ${why}`);
          onFatalRef.current();
        },
        onNeedsGesture: () => {
          if (cancelled) return;
          gestureNeededRef.current = true;
          setGestureNeeded(true);
        },
        onStart: () => {
          if (cancelled) return;
          // Playback is live again: this instance earned a fresh recovery budget.
          recoveriesRef.current = 0;
          gestureNeededRef.current = false;
          setGestureNeeded(false);
          // Their setVolume SWALLOWS positive values until chat has started — an unmute that
          // happened while connecting must be re-applied now or the stream stays silent.
          handleRef.current?.setVolume(mutedRef.current ? 0 : DEFAULT_VOLUME);
        },
      },
    })
      .then((handle) => {
        if (cancelled) return handle.teardown();
        handleRef.current = handle;
        // The mute store may have flipped between mount start and SDK ready.
        handle.setVolume(mutedRef.current ? 0 : DEFAULT_VOLUME);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn('[cams] imlive SDK unavailable:', err instanceof Error ? err.message : err);
        onFatalRef.current();
      });

    return () => {
      cancelled = true;
      handleRef.current?.teardown();
      handleRef.current = null;
    };
    // Remount on a different room: the connection data is per-session, so a reconnected model
    // needs a fresh instance rather than a mutated one.
  }, [model.imliveRoom?.workingServer, model.username, elementId, generation, recovery]);

  // The mute toggle, WITHOUT a remount: flipping the shared store just moves the live
  // instance's volume. The user-gesture forward happens ONLY when the SDK asked for one —
  // that call re-requests the stream in their code, which would kill healthy playback.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.setVolume(muted ? 0 : DEFAULT_VOLUME);
    if (!muted && gestureNeededRef.current) handle.userGesture();
  }, [muted]);

  return (
    <>
      <div ref={containerRef} id={elementId} className="absolute inset-0 h-full w-full" />
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
