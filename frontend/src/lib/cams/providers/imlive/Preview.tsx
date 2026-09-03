'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { mountImlivePlayer } from './sdk';
import { useLiveRecovery } from './useLiveRecovery';
import type { PreviewProps } from '../video-types';

/**
 * ImLive card preview: the same SDK in its documented FAST path
 * (`videoType: 'html5-pls'` + `gatewayType: 'none'`), which skips the chat-gateway handshake —
 * the difference between a preview that appears on hover and one that arrives too late.
 *
 * Always silent and non-interactive: volume 0, no sound button, and the host's holder is
 * pointer-events-none so clicks fall through to the card's link.
 *
 * Same mount discipline as ./Player.tsx: only the room's connection data (and an explicit
 * remount) may rebuild the SDK instance. The host's callbacks are read through refs, because
 * inline handlers get a new identity on every parent render and would otherwise restart the
 * preview mid-hover.
 */
export default function ImlivePreview({ model, onReady, onFatal }: PreviewProps) {
  const elementId = `imlive-preview-${useId().replace(/[:]/g, '')}`;
  const [generation, setGeneration] = useState(0);
  const teardownRef = useRef<(() => void) | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const modelRef = useRef(model);
  const onReadyRef = useRef(onReady);
  const onFatalRef = useRef(onFatal);
  // Synced in an effect, not during render (React forbids touching ref.current while
  // rendering). Declared above the mount effect so it runs first on every commit.
  useEffect(() => {
    modelRef.current = model;
    onReadyRef.current = onReady;
    onFatalRef.current = onFatal;
  });

  useEffect(() => {
    let cancelled = false;
    mountImlivePlayer({
      model: modelRef.current,
      elementId,
      volume: 0,
      preview: true,
      soundButton: false,
      handlers: {
        onStart: () => !cancelled && onReadyRef.current(),
        // A preview is disposable: no recovery dance, just hand back to the static thumbnail.
        onFail: () => !cancelled && onFatalRef.current(),
      },
    })
      .then((handle) => {
        if (cancelled) return handle.teardown();
        teardownRef.current = handle.teardown;
      })
      .catch(() => !cancelled && onFatalRef.current());

    return () => {
      cancelled = true;
      teardownRef.current?.();
      teardownRef.current = null;
    };
  }, [model.imliveRoom?.workingServer, model.username, elementId, generation]);

  // Their SDK pauses on tab-hide; a preview left frozen on return is worse than a fresh one.
  const readVideo = useCallback(() => containerRef.current?.querySelector('video'), []);
  const remount = useCallback(() => setGeneration((g) => g + 1), []);
  useLiveRecovery(readVideo, remount);

  return <div ref={containerRef} id={elementId} className="absolute inset-0 h-full w-full" />;
}
