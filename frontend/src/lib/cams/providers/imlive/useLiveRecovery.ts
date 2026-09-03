'use client';

import { useEffect, useMemo, useRef } from 'react';

/**
 * Recover ImLive playback around tab backgrounding.
 *
 * TWO WAYS BACKGROUNDING BREAKS THIS PROVIDER, both reported as "the stream is stuck, or it
 * shows a Watch-on-ImLive button":
 *
 *  1. STALL. Their SDK ships its own `visibilitychange` handler (in video-chat.js) that pauses
 *     the player on hide and calls `play()` on return — every path but iOS. Resuming a LIVE
 *     stream from a buffer position the live edge abandoned minutes ago either freezes or dies;
 *     measured in a real browser as `bufferAppendError` three times over, then "fatal media
 *     error encountered, try to recover". Browser-level background-video throttling produces
 *     the same end state, so we watch for the SYMPTOM (playback not advancing) rather than
 *     trusting any one cause.
 *
 *  2. DROPPED ROOM. Background tabs get their timers throttled to roughly one tick a minute,
 *     which is not enough to keep the room's comms connection alive. The room then reports
 *     itself closed, our `onFail` fires, and the host permanently replaces the player with the
 *     affiliate facade — that is the CTA button appearing where video used to be. A close that
 *     lands while the page is hidden is an interruption, not a dead room, so it deserves a
 *     fresh instance rather than a tombstone.
 *
 * Rebuilding is the only correct resume for live video: a new instance rejoins at the live
 * edge. Rebuilding INTO a hidden tab would just break again, so a recovery requested while
 * hidden is deferred until the page comes back.
 *
 * Provider-local by design: our other surfaces (Chaturbate's iframe, the shared hls.js player)
 * hold no room connection and never pause themselves, so none of them need any of this.
 */
export function useLiveRecovery(
  /** Reads the SDK's <video> element; null while it's absent (which is itself a stall). */
  getVideo: () => HTMLVideoElement | null | undefined,
  /** Tear down and mount a fresh instance. */
  remount: () => void,
) {
  /** How long their own play() gets before we overrule it. */
  const GRACE_MS = 1200;
  /** Advancing by less than this over the grace window is a stall, not a slow start. */
  const MIN_ADVANCE_S = 0.2;
  /** A failure this soon after returning is still fallout from being backgrounded. */
  const INTERRUPT_WINDOW_MS = 8000;
  /** Breathing room before reconnecting, so their gateway doesn't answer `accessDenied`. */
  const RETRY_BACKOFF_MS = 1500;

  // Refs so a re-rendered caller never re-subscribes the listener. Synced in an effect rather
  // than during render, which React forbids.
  const getVideoRef = useRef(getVideo);
  const remountRef = useRef(remount);
  useEffect(() => {
    getVideoRef.current = getVideo;
    remountRef.current = remount;
  });

  /** Visibility bookkeeping, read by the callbacks below. */
  const marks = useRef<{
    returnedAt: number;
    hidden: boolean;
    deferred: boolean;
    retryTimer?: ReturnType<typeof setTimeout>;
  }>({ returnedAt: 0, hidden: false, deferred: false });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        marks.current.hidden = true;
        return;
      }
      marks.current.hidden = false;
      marks.current.returnedAt = Date.now();

      // A failure that arrived while we were hidden: rebuild now that rebuilding can work.
      if (marks.current.deferred) {
        marks.current.deferred = false;
        remountRef.current();
        return;
      }

      const video = getVideoRef.current();
      if (!video) {
        remountRef.current();
        return;
      }
      const before = video.currentTime;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Hidden again already: whatever we did now would be undone on the next return.
        if (document.visibilityState !== 'visible') return;
        const current = getVideoRef.current();
        const stalled =
          !current ||
          current.paused ||
          current.readyState < 3 /* HAVE_FUTURE_DATA */ ||
          current.currentTime - before < MIN_ADVANCE_S;
        if (stalled) remountRef.current();
      }, GRACE_MS);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    const marksAtMount = marks.current;
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearTimeout(timer);
      clearTimeout(marksAtMount.retryTimer);
    };
  }, []);

  return useMemo(
    () => ({
      /**
       * Is a failure happening right now most likely the backgrounding rather than a dead room?
       * True while hidden and for a short window after returning.
       */
      interrupted: () =>
        marks.current.hidden ||
        document.visibilityState === 'hidden' ||
        Date.now() - marks.current.returnedAt < INTERRUPT_WINDOW_MS,
      /**
       * Rebuild after a short pause, or as soon as the page is visible again. The pause is not
       * cosmetic: reconnecting instantly to a room that just dropped us is what their gateway
       * answers with `accessDenied`.
       */
      recover: () => {
        if (document.visibilityState !== 'visible') {
          marks.current.deferred = true;
          return;
        }
        clearTimeout(marks.current.retryTimer);
        marks.current.retryTimer = setTimeout(() => remountRef.current(), RETRY_BACKOFF_MS);
      },
    }),
    [INTERRUPT_WINDOW_MS, RETRY_BACKOFF_MS],
  );
}
