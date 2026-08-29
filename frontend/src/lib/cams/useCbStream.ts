'use client';

import { useEffect, useState } from 'react';

export type CbStream = 'pending' | string | null;

/**
 * Resolves a Chaturbate room's HLS playlist through our /api/cams/cb-stream route (see its
 * header for why). 'pending' while fetching, the playlist URL on success, null when the
 * resolver failed — consumers then fall back to the static link-out facade, so playback
 * degrades but never breaks. Fetches only while `active` (a card hover must not resolve
 * streams for the whole grid).
 */
export function useCbStream(username: string | undefined, active: boolean): CbStream {
  // The result remembers WHICH username it belongs to — 'pending' is derived, never written
  // synchronously in the effect (no setState-in-effect cascade; async resolution only).
  const [result, setResult] = useState<{ u: string; hls: string | null } | null>(null);

  useEffect(() => {
    if (!username || !active) return;
    // Abort on cleanup — rapid hovering across CB cards would otherwise leave N open sockets
    // (browser ~6/host cap) blocking other same-origin requests for the resolver's timeout.
    const ac = new AbortController();
    fetch(`/api/cams/cb-stream/${encodeURIComponent(username)}/`, { signal: ac.signal })
      .then((r) => r.json())
      .then((d: { hls?: string | null }) => setResult({ u: username, hls: typeof d.hls === 'string' ? d.hls : null }))
      .catch((err: unknown) => {
        if ((err as Error)?.name !== 'AbortError') setResult({ u: username, hls: null });
      });
    return () => ac.abort();
  }, [username, active]);

  if (!username) return null;
  return result && result.u === username ? result.hls : 'pending';
}
