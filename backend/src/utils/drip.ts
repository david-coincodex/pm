/**
 * The newsletter onboarding drip — three emails per new account:
 *
 *   1. pm-welcome          right after the address is confirmed (lifecycle, src/index.ts)
 *   2. pm-drip-deals       ~48h later                      (hourly cron, src/cron/newsletter-drip.ts)
 *   3. pm-drip-chaturbate  ~48h after that                 (same cron)
 *
 * Mailgun has no automation of its own — it is a send API — so the sequencing lives here, as
 * two fields on the user: `dripStep` (highest step DELIVERED, 0–3) and `lastDripSentAt` (the
 * 48h gate). Progress is claimed with a COMPARE-AND-SWAP update (`where` includes the step we
 * think the user is on) BEFORE the send, so every email is at-most-once: the welcome hooks can
 * fire multiple times for one account (Google afterCreate, then any later update whose payload
 * carries `confirmed: true` — an admin saving the user form does), and a raced claim simply
 * loses the update and skips. For marketing, a rare missed email — which the cron heartbeat
 * reports — beats any chance of a duplicate.
 *
 * The CONTENT is never pre-generated: the templates live at Mailgun (scripts/lib/
 * email-templates.mjs) and every dynamic fact — deals, prices, the Chaturbate online count —
 * is fetched HERE, at send time, and passed as variables.
 *
 * Every drip send carries `o:tag: newsletter-drip`, and the templates' unsubscribe link is
 * Mailgun's %tag_unsubscribe_url%: suppression then applies ONLY to mail with this tag, so an
 * unsubscriber keeps receiving password resets and confirmations (the plain %unsubscribe_url%
 * would suppress those too — domain-wide). A suppressed recipient still returns 200 from the
 * send API (the drop happens at delivery), so the drip advances past them without special
 * handling.
 */

import type { Core } from '@strapi/strapi';
import { CAM_MODEL_UID } from '../api/cam-model/constants';

const USER_UID = 'plugin::users-permissions.user';
const DRIP_TAG = 'newsletter-drip';

/** The "after 2 days" the drip promises — a strict 48h floor; the hourly cron adds ≤1h. */
export const DRIP_STEP_GAP_MS = 48 * 60 * 60 * 1000;

/** Steps the CRON advances (the welcome, step 1, is lifecycle-triggered). */
export const CRON_STEPS = [1, 2] as const;

const frontendUrl = () => (process.env.FRONTEND_URL ?? 'http://localhost:3002').replace(/\/+$/, '');
const supportEmail = () => process.env.SUPPORT_EMAIL ?? 'info@pornmode.com';

/**
 * Public base for media in email `src` attributes. The CMS origin, NOT the frontend: uploads
 * are served by Strapi's own /uploads route, and in production that host (cms.pornmode.com)
 * is publicly reachable — which is what an email client's image proxy needs. (Staging's CMS
 * sits behind Cloudflare Access, so staging-sent emails show the alt-text fallback; known and
 * accepted — staging mail only ever reaches testers.)
 */
const mediaBase = () => (process.env.STRAPI_PUBLIC_URL ?? 'http://localhost:1339').replace(/\/+$/, '');

type MediaRow = { url?: string; formats?: Record<string, { url?: string }> } | null | undefined;

/**
 * Absolute URL for a cover image, preferring the ~500px `small` format — the card column is
 * 534px, so `small` is sharp enough at a fraction of the original's weight. Stored paths are
 * root-relative `/uploads/...` by house rule (see relative-media-urls.ts).
 */
const coverUrl = (image: MediaRow): string | null => {
  const path = image?.formats?.small?.url ?? image?.url;
  if (!path) return null;
  return path.startsWith('/') ? `${mediaBase()}${path}` : path;
};

/** Two-line teaser, like the site card's clamped short_description. */
const shortDesc = (text: unknown): string | null => {
  if (typeof text !== 'string' || !text.trim()) return null;
  const t = text.trim();
  return t.length <= 140 ? t : `${t.slice(0, 137).trimEnd()}…`;
};

/** No key ⇒ no mailer is registered (config/plugins.ts) ⇒ the whole drip is a no-op. */
export const mailerConfigured = () => Boolean(process.env.MAILGUN_API_KEY);

/**
 * "$9.95" / "$10" — prices arrive in the template pre-formatted; handlebars does no math.
 * Decimal columns can come back as strings from the db layer, hence the Number().
 */
const fmtPrice = (value: unknown): string | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
};

type OfferRow = { id: number; price: unknown; full_price: unknown; isActive: boolean };

const discountPercent = (offer: OfferRow): number | null => {
  const price = Number(offer.price);
  const full = Number(offer.full_price);
  if (!Number.isFinite(price) || !Number.isFinite(full) || full <= price) return null;
  return Math.round(((full - price) / full) * 100);
};

/**
 * The offer the email shows for a site: the ACTIVE offer with the biggest discount — the same
 * choice the homepage sidebar makes — falling back to the cheapest when nothing is discounted.
 */
const bestOffer = (offers: OfferRow[] | undefined): OfferRow | null => {
  const active = (offers ?? []).filter((o) => o.isActive && Number(o.price) > 0);
  if (!active.length) return null;
  const discounted = active
    .map((o) => ({ o, d: discountPercent(o) }))
    .filter((x): x is { o: OfferRow; d: number } => x.d !== null)
    .sort((a, b) => b.d - a.d);
  if (discounted.length) return discounted[0].o;
  return [...active].sort((a, b) => Number(a.price) - Number(b.price))[0];
};

export type DealVars = Record<string, string>;

/** Flat handlebars variables for one deal card (see dealCard in email-templates.mjs). */
const dealToVars = (prefix: string, deal: Deal): DealVars => {
  const { offer } = deal;
  const vars: DealVars = {
    [`${prefix}_name`]: deal.name,
    [`${prefix}_price`]: fmtPrice(offer.price) ?? '',
    // The tracked /offer/<id>/ redirect, not the raw affiliate link — clicks stay measurable.
    [`${prefix}_url`]: `${frontendUrl()}/offer/${offer.id}/`,
    // The same two destinations as the site card's buttons: /discounts/<slug>/ + the offer.
    [`${prefix}_site_url`]: `${frontendUrl()}/discounts/${deal.slug}/`,
  };
  if (deal.image) vars[`${prefix}_img`] = deal.image;
  if (deal.description) vars[`${prefix}_desc`] = deal.description;
  const full = fmtPrice(offer.full_price);
  const discount = discountPercent(offer);
  if (full && discount !== null) {
    vars[`${prefix}_fullprice`] = full;
    vars[`${prefix}_discount`] = `${discount}%`;
  }
  return vars;
};

export type Deal = {
  name: string;
  slug: string;
  image: string | null;
  description: string | null;
  offer: OfferRow;
};

/** Card-shaped Deal from a populated site row, like the site's SiteCard (cover ?? logo). */
const siteToDeal = (site: any, offer: OfferRow): Deal => ({
  name: site.name,
  slug: site.slug,
  image: coverUrl(site.cover_image ?? site.logo),
  description: shortDesc(site.short_description),
  offer,
});

/**
 * Top featured deals, LIVE: mirrors the frontend's getFeaturedDeals (frontend/src/lib/
 * strapi.ts) — active `featured` rows inside their validity window, priority first — then
 * picks each site's best offer. Sites without an active offer are skipped, duplicates
 * (two featured rows for one site) collapse to the first.
 */
export async function fetchFeaturedDeals(strapi: Core.Strapi, limit = 3): Promise<Deal[]> {
  const now = new Date().toISOString();
  const rows: any[] = await strapi.db.query('api::featured.featured').findMany({
    where: {
      isActive: true,
      $or: [
        { validFrom: { $null: true }, validTo: { $null: true } },
        { validFrom: { $lte: now }, validTo: { $gte: now } },
      ],
    },
    orderBy: { priority: 'desc' },
    limit: 10,
    populate: { site: { populate: { offers: true, cover_image: true, logo: true } } },
  });

  const deals: Deal[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    const site = row.site;
    if (!site?.isActive || seen.has(site.id)) continue;
    const offer = bestOffer(site.offers);
    if (!offer) continue;
    seen.add(site.id);
    deals.push(siteToDeal(site, offer));
    if (deals.length >= limit) break;
  }
  return deals;
}

/** Chaturbate's best current offer, for the final drip email. Null when none is configured. */
export async function fetchChaturbateDeal(strapi: Core.Strapi): Promise<Deal | null> {
  const site: any = await strapi.db.query('api::site.site').findOne({
    where: { slug: 'chaturbate', isActive: true },
    populate: { offers: true, cover_image: true, logo: true },
  });
  const offer = site ? bestOffer(site.offers) : null;
  return offer ? siteToDeal(site, offer) : null;
}

/**
 * How many Chaturbate models are online RIGHT NOW, from our own registry: the roster sync
 * bulk-touches `lastSeenAt` for the whole online roster every ~5 minutes (see
 * api/cam-model/constants.ts), so anything seen inside 10 minutes is live. Returns null below
 * a floor — an email must never boast "37 models online" because the sync happens to be down.
 */
export async function fetchChaturbateOnlineCount(strapi: Core.Strapi): Promise<number | null> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const count = await strapi.db
    .query(CAM_MODEL_UID)
    .count({ where: { provider: 'cb', lastSeenAt: { $gt: cutoff } } });
  return count >= 50 ? count : null;
}

/** One send path for all drip mail: branded from, replyable, TAGGED (see file comment). */
async function sendDripEmail(
  strapi: Core.Strapi,
  opts: { to: string; subject: string; template: string; variables: Record<string, unknown>; text: string },
): Promise<void> {
  await strapi
    .plugin('email')
    .service('email')
    .send({
      from: `PornMode <${process.env.EMAIL_FROM ?? 'noreply@pornmode.com'}>`,
      replyTo: supportEmail(),
      to: opts.to,
      subject: opts.subject,
      template: opts.template,
      'o:tag': DRIP_TAG,
      'h:X-Mailgun-Variables': JSON.stringify({ support_email: supportEmail(), ...opts.variables }),
      // Text alternative: Mailgun renders the template only into the HTML part, and a message
      // with no text part scores worse with spam filters.
      text: opts.text,
    });
}

/**
 * Claim a drip step with a real CAS. `updateMany` on purpose, NOT `update`: `update` is a
 * findOne-then-update-by-id (two statements — a check-then-act race, and it re-runs the
 * per-entity lifecycles this claim is called FROM), while `updateMany` executes ONE
 * `UPDATE … WHERE` and reports the affected-row count. The where only matches while the user
 * is still ON `fromStep`, so of N concurrent claimers exactly one sees count 1.
 *
 * NULL `dripStep` deliberately matches NOTHING. Rows that predate the column stay NULL (the
 * migration adds it without a DB default; the attribute default `0` is applied only on
 * create), and an admin saving such a user re-posts `confirmed: true` — which reaches this
 * claim via the afterUpdate hook. Matching NULL here would greet a years-old account with
 * "your account is ready" and pull it into the whole drip; excluding it makes NULL mean
 * "existing user, never enroll", symmetric with the cron's `$in [1, 2]`.
 */
async function claimStep(strapi: Core.Strapi, userId: number, fromStep: number): Promise<boolean> {
  const { count } = await strapi.db.query(USER_UID).updateMany({
    where: { id: userId, dripStep: fromStep },
    data: { dripStep: fromStep + 1, lastDripSentAt: new Date().toISOString() },
  });
  return count === 1;
}

/**
 * Step 1, the welcome — called (fire-and-forget) from the SAME lifecycle hooks that subscribe
 * the address to the newsletter (src/index.ts), i.e. only ever for a CONFIRMED account.
 * Exactly-once via the CAS; a failed send after a successful claim is logged and reported by
 * the caller's log stream, not retried (at-most-once, see file comment).
 */
export async function sendWelcomeOnce(user: { id: number; email: string }, strapi: Core.Strapi): Promise<void> {
  if (!mailerConfigured()) return;
  try {
    if (!(await claimStep(strapi, user.id, 0))) return; // another trigger already sent it
    const site = frontendUrl();
    await sendDripEmail(strapi, {
      to: user.email,
      subject: 'Welcome to PornMode — here is how it works',
      template: 'pm-welcome',
      variables: {
        browse_url: `${site}/live-sex/`,
        favorites_url: `${site}/account/favorites/`,
      },
      text: [
        'Welcome to PornMode — your account is ready.',
        'Save your favorite cam models: tap the heart on any model and find her again at ' + `${site}/account/favorites/`,
        'Live cams from Chaturbate, BongaCams, Stripchat and ImLive, all in one place: ' + `${site}/live-sex/`,
        `Verified porn deals, prices checked continuously: ${site}/`,
        'Over the next few days we will send a couple of short emails with the best current deals and what is happening on cams.',
      ].join('\n\n'),
    });
    strapi.log.info(`[drip] welcome sent to user ${user.id}`);
  } catch (error) {
    strapi.log.error(`[drip] welcome for user ${user.id} failed: ${(error as Error).message}`);
  }
}

/** Everything the cron pre-fetches ONCE per run and reuses for every due user. */
export type DripRunData = {
  deals: Deal[];
  cbDeal: Deal | null;
  cbOnline: number | null;
};

export async function fetchDripRunData(
  strapi: Core.Strapi,
  need: { deals: boolean; chaturbate: boolean },
): Promise<DripRunData> {
  return {
    deals: need.deals ? await fetchFeaturedDeals(strapi) : [],
    cbDeal: need.chaturbate ? await fetchChaturbateDeal(strapi) : null,
    cbOnline: need.chaturbate ? await fetchChaturbateOnlineCount(strapi) : null,
  };
}

/**
 * Send the email for the step AFTER `fromStep` to one user, CAS-claiming first. Returns what
 * happened so the cron can count a degraded run. `no-data` is decided BEFORE the claim, so the
 * user is retried on a later run once the data is back.
 */
export async function sendDripStep(
  strapi: Core.Strapi,
  user: { id: number; email: string },
  fromStep: number,
  data: DripRunData,
): Promise<'sent' | 'skipped' | 'no-data' | 'failed'> {
  const site = frontendUrl();

  let payload: { subject: string; template: string; variables: Record<string, unknown>; text: string };
  if (fromStep === 1) {
    // Step 2 — featured deals. An empty deals list would make an empty email: skip WITHOUT
    // claiming and let a later run retry once content exists again.
    if (!data.deals.length) return 'no-data';
    const variables: Record<string, unknown> = { deals_url: `${site}/` };
    data.deals.forEach((deal, i) => Object.assign(variables, dealToVars(`deal${i + 1}`, deal)));
    payload = {
      subject: "Today's best porn deals, checked and current",
      template: 'pm-drip-deals',
      variables,
      text: [
        'The best deals on PornMode right now — prices verified when this email was sent:',
        ...data.deals.map((deal) => {
          const price = fmtPrice(deal.offer.price);
          const discount = discountPercent(deal.offer);
          return `- ${deal.name}: ${price}${discount !== null ? ` (${discount}% off)` : ''} → ${site}/offer/${deal.offer.id}/`;
        }),
        `See all deals: ${site}/`,
      ].join('\n\n'),
    };
  } else if (fromStep === 2) {
    // Step 3 — Chaturbate. Needs at least one of the two live facts to be worth sending.
    if (!data.cbDeal && data.cbOnline === null) return 'no-data';
    const variables: Record<string, unknown> = { cams_url: `${site}/live-sex/chaturbate/` };
    if (data.cbOnline !== null) variables.cb_online_count = data.cbOnline.toLocaleString('en-US');
    if (data.cbDeal) Object.assign(variables, dealToVars('cb_deal', data.cbDeal));
    payload = {
      subject: 'Chaturbate: free cams, and a deal to go with them',
      template: 'pm-drip-chaturbate',
      variables,
      text: [
        'Have you tried Chaturbate yet? The biggest free cam site in the world — watch for free, tip when someone earns it.',
        ...(data.cbOnline !== null ? [`${data.cbOnline.toLocaleString('en-US')} models are live right now.`] : []),
        ...(data.cbDeal ? [`Current deal: ${data.cbDeal.name} ${fmtPrice(data.cbDeal.offer.price)} → ${site}/offer/${data.cbDeal.offer.id}/`] : []),
        `Watch Chaturbate cams: ${site}/live-sex/chaturbate/`,
      ].join('\n\n'),
    };
  } else {
    return 'skipped';
  }

  if (!(await claimStep(strapi, user.id, fromStep))) return 'skipped';
  try {
    await sendDripEmail(strapi, { to: user.email, ...payload });
    return 'sent';
  } catch (error) {
    // Claimed but not sent: deliberately NOT rolled back (at-most-once). The cron reports it.
    strapi.log.error(`[drip] step ${fromStep + 1} for user ${user.id} failed: ${(error as Error).message}`);
    return 'failed';
  }
}
