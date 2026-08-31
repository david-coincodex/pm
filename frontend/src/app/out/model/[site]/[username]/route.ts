import { NextResponse } from 'next/server';
import { adapterById, findOnlineModel } from '@/lib/cams/registry';
import { findKnownModel } from '@/lib/cams/modelDb';
import { providerFromSlug, CAM_PROVIDER_SLUGS } from '@/lib/cams/types';
import { siteSettings } from '@/lib/siteSettings';
import { cleanCamUsername } from '@/lib/cams/urls';
import { trackServerEvent } from '@/lib/serverAnalytics';

/**
 * Outbound affiliate redirect for cam rooms (/out/model/<provider>/<username>/), counted
 * server-side. Lesson from /offer/ (#14): this audience blocks gtag, so a client-side
 * cam_click event measures almost nothing — the redirect hop is the only reliable counter.
 * The target URL is DERIVED from provider+username (never taken from the request), so this
 * can't be abused as an open redirect. Kept out of the index twice over, like /offer/:
 * robots.txt disallows /out/, and every response carries X-Robots-Tag: noindex (a redirect
 * has no HTML for a meta tag — the header is its equivalent).
 *
 * force-dynamic is LOAD-BEARING: this is a per-username affiliate redirect resolved from the
 * live snapshot + registry at request time. Without it the production standalone build
 * mis-optimizes the dynamic route handler and 404s EVERY username (works in `next dev`, dies in
 * prod — every cam click 404'd on production until this was added). The other request-time cam
 * route handlers (sitemap.xml, models-sitemap.xml) declare it for the same reason.
 */
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ site: string; username: string }> }) {
  const { site, username: rawUsername } = await ctx.params;
  const noindex = { 'X-Robots-Tag': 'noindex' };
  // Feature-flagged like every other cam surface: a disabled feature must not keep
  // redirecting to affiliates and firing cam_click events.
  if (!siteSettings.features.liveSex) return new NextResponse('Not found', { status: 404, headers: noindex });
  // Full provider name in the URL (/out/model/chaturbate/…) — the short ids never surface.
  const provider = providerFromSlug(site);
  if (!provider) return new NextResponse('Not found', { status: 404, headers: noindex });
  const adapter = adapterById.get(provider);
  const username = cleanCamUsername(rawUsername);
  if (!adapter || !username) return new NextResponse('Not found', { status: 404, headers: noindex });

  // Online rooms get the room's own affiliate URL from the live snapshot; offline falls back
  // to the profile link. Both carry the affiliate campaign — the adapters guarantee that.
  const model = await findOnlineModel(provider, username);
  if (!model) {
    // Not live — only redirect models the registry has ever seen. Garbage usernames used to
    // 302 to the provider AND fire a cam_click event, polluting the metrics; now they 404.
    // Registry unreachable ('error') fails open: never break a real click on a CMS blip.
    const known = await findKnownModel(provider, username);
    if (known.status === 'missing') return new NextResponse('Not found', { status: 404, headers: noindex });
  }
  // Always the saved template (adapter.outboundUrl) — identical for online and offline
  // models, so the money link can never depend on feed-row quirks.
  const target = adapter.outboundUrl(username);

  await trackServerEvent('cam_click', {
    // Full name in analytics too — reports should read "chaturbate", not "cb".
    provider: CAM_PROVIDER_SLUGS[provider],
    username,
    cam_online: model ? 'yes' : 'no',
  });

  return NextResponse.redirect(target, { status: 302, headers: noindex });
}
