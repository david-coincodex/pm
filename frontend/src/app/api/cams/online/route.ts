import { NextResponse } from 'next/server';
import { getOnlineModels } from '@/lib/cams/registry';

/**
 * Which of these models are online right now — the one per-visitor query the statically
 * rendered listing pages can't answer themselves.
 *
 * The listing HTML is shared by every visitor (that is what makes it instant), so a logged-in
 * user's "favorites online now" strip is filled in here after hydration instead. Reads the
 * in-memory snapshot, so this costs a Map lookup per id and never touches a provider.
 */
export const dynamic = 'force-dynamic';

const MAX_IDS = 100;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('ids') ?? '';
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({ models: [] });

  const { byId } = await getOnlineModels();
  // Only the fields a card renders — the client has no use for tags, embeds or affiliate URLs.
  const models = ids
    .map((id) => byId.get(id))
    .filter((m) => m !== undefined)
    .map((m) => ({
      id: m.id,
      provider: m.provider,
      username: m.username,
      displayName: m.displayName,
      thumbUrl: m.thumbUrl,
      gender: m.gender,
      viewers: m.viewers,
    }));

  return NextResponse.json({ models }, { headers: { 'Cache-Control': 'private, no-store' } });
}
