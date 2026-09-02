'use client';

import { useEffect, useId, useRef } from 'react';
import { mountImlivePlayer } from './sdk';
import type { PreviewProps } from '../video-types';

/**
 * ImLive card preview: the same SDK in its documented FAST path
 * (`videoType: 'html5-pls'` + `gatewayType: 'none'`), which skips the chat-gateway handshake —
 * the difference between a preview that appears on hover and one that arrives too late.
 *
 * Always silent and non-interactive: volume 0, no sound button, and the host's holder is
 * pointer-events-none so clicks fall through to the card's link.
 */
export default function ImlivePreview({ model, onReady, onFatal }: PreviewProps) {
  const elementId = `imlive-preview-${useId().replace(/[:]/g, '')}`;
  const teardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    mountImlivePlayer({
      model,
      elementId,
      volume: 0,
      preview: true,
      soundButton: false,
      handlers: {
        onStart: () => !cancelled && onReady(),
        // A preview is disposable: no recovery dance, just hand back to the static thumbnail.
        onFail: () => !cancelled && onFatal(),
      },
    })
      .then((teardown) => {
        if (cancelled) return teardown();
        teardownRef.current = teardown;
      })
      .catch(() => !cancelled && onFatal());

    return () => {
      cancelled = true;
      teardownRef.current?.();
      teardownRef.current = null;
    };
  }, [model, elementId, onReady, onFatal]);

  return <div id={elementId} className="absolute inset-0 h-full w-full" />;
}
