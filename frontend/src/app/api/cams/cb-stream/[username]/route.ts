import { NextResponse } from 'next/server';
import { cleanCamUsername } from '@/lib/cams/urls';

/**
 * Resolves a Chaturbate room's HLS playlist for the model-page player.
 *
 * WHY: the embed player can't be reliably muted (restores saved volume from ITS localStorage);
 * their player takes its stream from `window.initialRoomDossier.hls_source` in the embed HTML —
 * a tokenized LL-HLS URL. Playing it in our own <video> gives BongaCams parity: fluid video,
 * native mute/unmute, no chat.
 *
 * CRITICAL — the token/session is SINGLE-USE (verified: a URL that played once fails on the
 * next viewer). So we must NOT cache a successful URL across requests — every caller gets a
 * FRESH embed fetch and its own token. We cache only the NULL result (private/away/offline
 * rooms carry no hls_source) for a short window, since that carries no session and re-fetching
 * a known-streamless room every hover is wasteful.
 *
 * FRAGILITY, accepted: hls_source is undocumented. The player treats a null/failed resolution
 * as "fall back to the static link-out facade" — playback degrades, never breaks.
 */
const NEG_TTL_MS = 30_000;
const NEG_MAX = 500;

type Box = { neg: Map<string, number> };
const g = globalThis as typeof globalThis & { __pmCbStream?: Box };
const box: Box = (g.__pmCbStream ??= { neg: new Map() });

async function resolveHls(username: string): Promise<string | null> {
  const res = await fetch(`https://chaturbate.com/embed/${encodeURIComponent(username)}/?embed_video_only=1`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'text/html',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/window\.initialRoomDossier\s*=\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  try {
    const dossier = JSON.parse(JSON.parse(`"${m[1]}"`)) as { hls_source?: string };
    const hls = dossier.hls_source;
    return typeof hls === 'string' && hls.startsWith('https://') ? hls : null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username: raw } = await ctx.params;
  const username = cleanCamUsername(raw);
  if (!username) return NextResponse.json({ hls: null }, { status: 404 });

  const negAt = box.neg.get(username);
  if (negAt && Date.now() - negAt < NEG_TTL_MS) {
    return NextResponse.json({ hls: null }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const hls = await resolveHls(username).catch(() => null);
  if (hls === null) {
    if (box.neg.size >= NEG_MAX) box.neg.clear();
    box.neg.set(username, Date.now());
  } else {
    box.neg.delete(username);
  }
  return NextResponse.json({ hls }, { headers: { 'Cache-Control': 'no-store' } });
}
