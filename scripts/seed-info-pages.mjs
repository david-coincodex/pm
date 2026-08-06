/**
 * Populate the three remaining company pages in Strapi: About, Advertise, Contact.
 *
 * The five legal/policy bodies were written by `seed-legal-pages.mjs`; these three were created
 * with titles, h1s and meta descriptions but an empty `content`, so they render as a bare heading.
 *
 * The copy below is hand-written rather than model-generated, on purpose. These pages make claims
 * about the business — what it is, how it earns, what it will and will not do for an advertiser —
 * and a generated draft invents exactly those specifics (a founding year, a team, traffic numbers)
 * in prose fluent enough that nobody checks them. Everything asserted here is either verifiable
 * from the catalogue or is a statement of policy that already appears in the legal pages, so the
 * set stays consistent with itself:
 *   - "over 300 sites", "more than 30 categories": 304 sites / 34 categories at the time of writing,
 *     phrased so growth keeps them true.
 *   - the scoring criteria and the "commission does not buy a ranking" promise are lifted verbatim
 *     in substance from the Affiliate Disclaimer.
 *   - billing/cancellation belongs to the third-party site, per the Terms of Service.
 *
 * Deliberately absent: traffic figures and a rate card on the Advertise page. Those are numbers only
 * the business has, and a made-up media kit is worse than none — the page asks advertisers to
 * request current figures instead. Add them here once known.
 *
 * Unlike the legal pages, this copy needs no [LEGAL ENTITY] / [JURISDICTION] placeholder: the
 * operating entity is named in the Terms, and nothing here depends on it. Nothing in these bodies
 * needs filling in before they can go live.
 *
 * Usage:
 *   node scripts/seed-info-pages.mjs                   # dry run (default)
 *   node scripts/seed-info-pages.mjs --apply
 *   node scripts/seed-info-pages.mjs --apply --force   # also overwrite non-empty bodies
 *
 * Env (scripts/.env): STRAPI_URL, STRAPI_TOKEN
 */

import { STRAPI_URL, TOKEN, requireToken, api } from './lib/strapi.mjs';
import { withRetry } from './lib/http.mjs';

const SITE = 'PornMode';
const EMAIL = 'info@pornmode.com';

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------
const ABOUT = `<p>${SITE} is an independent directory and price-comparison service for paid adult websites. We track what the major paysites and cam sites actually cost, what the current discounts are, and whether a subscription is worth buying — so you can compare in one place instead of opening twenty tabs.</p>

<h2>What you will find here</h2>
<ul>
<li><strong>Over 300 sites</strong>, each with its own page listing current pricing, trial terms, what is included, and which payment methods are accepted.</li>
<li><strong>Discounts and offers</strong> with the real per-month cost worked out, and the original price shown next to it, so a "70% off" claim can be checked rather than taken on trust.</li>
<li><strong>Reviews and scores</strong> covering content quality and volume, update frequency, video quality, site usability, and value for money.</li>
<li><strong>More than 30 categories</strong> — by niche, by format, by type of site — for when you know what you want to watch but not where to get it.</li>
<li><strong>Guides and articles</strong> on how the deals work, what the renewal price becomes after an introductory term, and what to check before you pay.</li>
</ul>

<h2>How we rank and score</h2>
<p>Scores are our own assessment, not the site's marketing. We weigh how much content there is and how often it is added to, the technical quality of the video, how usable the site is, and what all of that costs over a year rather than in the first month. We describe drawbacks alongside strengths, and we say so plainly when we think an offer is poor value.</p>

<h2>How we make money</h2>
<p>${SITE} is free to use. Many of our outbound links are affiliate links: if you subscribe after following one, the site typically pays us a commission. You pay the same price you would have paid going direct, and often less, because some discounts exist only through our links.</p>
<p>Commission does not buy a good review, a high ranking, or a place on the Site, and a higher rate does not move a site up a list. Paid placements are labelled as sponsored; anything unlabelled reflects our own editorial judgement. The full detail is in our <a href="/page/affiliate-disclaimer/">Affiliate Disclaimer</a>.</p>

<h2>What we are not</h2>
<p>We do not operate, own, or host any of the sites we write about, and we do not produce adult content. No subscription is ever bought from us: every charge, renewal, refund, and cancellation is handled by the third-party site or its payment processor. If you need to cancel a subscription or dispute a charge, that request has to go to them — see our <a href="/page/terms/">Terms of Service</a>.</p>

<h2>Keeping this accurate</h2>
<p>Prices and offers in this industry change constantly, and some are limited by country or by time. We re-check them regularly, but the destination site is always the final word — confirm the current terms there before you pay. If you find a price that is wrong, a link that is broken, or a deal that has expired, please <a href="/page/contact/">tell us</a>; corrections are the most useful mail we get.</p>`;

// ---------------------------------------------------------------------------
// Advertise
// ---------------------------------------------------------------------------
const ADVERTISE = `<p>${SITE} reaches people at the point of purchase: visitors here are comparing paid adult subscriptions and looking for a discount before they buy. If you run a paysite, a cam site, or an affiliate programme, that is the audience this Site is built around.</p>

<h2>What we offer</h2>
<ul>
<li><strong>Offer and discount listings</strong> — your current pricing, trial, and deal terms on your site's page and in the relevant category rankings.</li>
<li><strong>Sponsored placement</strong> — promoted positions on category and listing pages, always labelled as sponsored.</li>
<li><strong>Featured site pages</strong> — an expanded page with gallery, feature breakdown, payment methods, and your live offers.</li>
<li><strong>Ad and trailer showcases</strong> — editorial articles built around a brand's commercials and promo clips, with the offer attached.</li>
<li><strong>Bundle inclusion</strong> — where your site fits a multi-site package we are presenting to buyers.</li>
</ul>

<h2>How we handle paid placement</h2>
<p>We will sell you position and prominence. We will not sell you a score, a review verdict, or a ranking based on editorial criteria — those stay independent, because the moment they are purchasable the Site is worth nothing to the readers you want to reach. Anything paid for is labelled as sponsored or advertising, so visitors can tell the difference. This is the same commitment we make to readers in our <a href="/page/affiliate-disclaimer/">Affiliate Disclaimer</a>.</p>
<p>We also decline creatives that mislead: fake countdowns, fake chat prompts, fake system warnings, or pricing that does not match what the visitor is charged at the destination.</p>

<h2>Getting listed</h2>
<p>If you want your site added or your existing listing updated, email us with:</p>
<ul>
<li>the site URL, and your affiliate programme or network;</li>
<li>current offers you want shown — price, billing period, trial terms, and what happens at renewal;</li>
<li>your tracking links, and any country restrictions on the offer;</li>
<li>logos, cover images, or promo media we may use.</li>
</ul>
<p>Listing a site is free — we add sites because they are relevant to readers, whether or not they pay us.</p>

<h2>Talk to us</h2>
<p>Email <a href="mailto:${EMAIL}">${EMAIL}</a> and tell us what you are trying to achieve. Ask for current traffic figures, available placements, and pricing, and we will send them over along with what we think will actually work for your offer.</p>`;

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------
const CONTACT = `<p>Email <a href="mailto:${EMAIL}">${EMAIL}</a> for anything at all. It is a real inbox read by the people who run the Site, and we aim to reply within a few business days.</p>
<p>A few things are worth sending to the right place, so here is what to include.</p>

<h2>A price is wrong, a link is broken, or a deal has expired</h2>
<p>This is the most useful message you can send us, and we fix it quickly. Please include the page URL and what you saw instead — the price on the destination site, or the error you hit. Offers in this industry change without notice, so we depend on being told.</p>

<h2>Advertising, listings, and partnerships</h2>
<p>If you run a site or an affiliate programme and want to be listed, featured, or promoted, see <a href="/page/advertise/">Advertise on ${SITE}</a> for what we offer and what to send. Listing a site is free.</p>

<h2>Content, rights, and removal requests</h2>
<p>We do not host or produce adult content — we publish descriptions, reviews, and promotional media relating to third-party sites. If you believe material on this Site infringes your rights, email us with the exact URL, an identification of the work concerned, and your relationship to it, and we will review and act on it. See our <a href="/page/disclaimer/">Adult Content Disclaimer</a> for how we treat third-party material.</p>

<h2>Privacy and your data</h2>
<p>To ask what data we hold, or to have it deleted, email us with enough detail to identify the request. Our <a href="/page/privacy/">Privacy Policy</a> sets out what we collect and why.</p>

<h2>What we cannot help with</h2>
<p>We are not any of the sites we list, and we take no payments. That means we cannot:</p>
<ul>
<li>cancel a subscription, stop a renewal, or issue a refund — those requests must go to the site you subscribed to or to its payment processor, not to us;</li>
<li>see, access, reset, or unlock your account with a third-party site;</li>
<li>tell you what a charge on your statement was for, beyond what is public about the site.</li>
</ul>
<p>Any cancellation guides we publish are informational only. Our <a href="/page/terms/">Terms of Service</a> explain the split in more detail.</p>`;

const PAGES = [
  { slug: 'about', content: ABOUT },
  { slug: 'advertise', content: ADVERTISE },
  { slug: 'contact', content: CONTACT },
];

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

async function put(documentId, data, label, query = '') {
  const res = await withRetry(
    () =>
      fetch(`${STRAPI_URL}/api/pages/${documentId}${query}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ data }),
      }),
    { label },
  );
  if (!res.ok) throw new Error(`${label}: ${res.status} ${(await res.text()).slice(0, 400)}`);
  return (await res.json()).data;
}

requireToken();
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${STRAPI_URL}${FORCE ? '  (--force: will overwrite existing bodies)' : ''}\n`);

// status=draft returns the draft version, which is what a PUT writes to.
const all = await api('/pages?fields[0]=slug&fields[1]=content&pagination[pageSize]=100&status=draft');
const bySlug = new Map(all.data.map((p) => [p.slug, p]));
let written = 0;

for (const { slug, content } of PAGES) {
  const page = bySlug.get(slug);
  if (!page) {
    console.log(`! ${slug}: page not found in Strapi, skipped`);
    continue;
  }

  const existing = (page.content ?? '').trim();
  if (existing && !FORCE) {
    console.log(`= ${slug}: already has ${existing.length} chars, left alone (use --force to replace)`);
    continue;
  }

  console.log(`${APPLY ? '~' : '?'} ${slug}: ${existing.length} -> ${content.length} chars`);
  if (!APPLY) continue;

  await put(page.documentId, { content }, `page ${slug} (draft)`);
  // A plain PUT lands on the draft only; these pages are already published, so without this the
  // site keeps serving the empty published version (getPageBySlug filters on publishedAt).
  await put(page.documentId, { content }, `page ${slug} (published)`, '?status=published');
  written += 1;
}

console.log(
  APPLY
    ? `\nDone — ${written} page${written === 1 ? '' : 's'} written (draft + published).`
    : `\nDry run only. Re-run with --apply to write.`,
);
