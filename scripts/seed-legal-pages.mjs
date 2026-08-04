/**
 * Populate the five legal / policy pages in Strapi, and de-duplicate page meta titles.
 *
 * Replaces the stale `scripts/seed_pages.py`, which emits Strapi *blocks* JSON for a `content` field
 * that is now a CKEditor HTML custom field — which is why all eight pages currently store an empty
 * body. It also hardcoded a live API token; this reads one from `scripts/.env` like every other script.
 *
 * Two independent passes:
 *   1. content  — writes the five policy bodies below. Refuses to overwrite a page that already has
 *                 content unless `--force`, so an editor's changes in the admin UI are never clobbered.
 *   2. metaTitle — strips a trailing "— PornMode" from EVERY page. The root layout already appends
 *                 `| PornMode` via the title template, so those pages were rendering
 *                 "Terms of Service — PornMode | PornMode".
 *
 * ⚠️ The bodies below are a good-faith starting draft, NOT legal advice, and they are deliberately
 * explicit about the two facts only the business can supply — the operating legal entity and the
 * governing jurisdiction. Both appear as [LEGAL ENTITY] / [JURISDICTION] placeholders and MUST be
 * filled in, and the whole set reviewed by a qualified lawyer, before this is treated as binding.
 *
 * Usage:
 *   node scripts/seed-legal-pages.mjs                # dry run
 *   node scripts/seed-legal-pages.mjs --apply
 *   node scripts/seed-legal-pages.mjs --apply --force  # also overwrite non-empty bodies
 *
 * Env (scripts/.env): STRAPI_URL, STRAPI_TOKEN
 */

import { STRAPI_URL, TOKEN, requireToken, api } from './lib/strapi.mjs';
import { withRetry } from './lib/http.mjs';

const SITE = 'PornMode';
const URL_ = 'https://pornmode.com';
const EMAIL = 'info@pornmode.com';
const UPDATED = '3 August 2026';

const ENTITY = '[LEGAL ENTITY]';
const JURISDICTION = '[JURISDICTION]';

const updated = `<p><em>Last updated: ${UPDATED}</em></p>`;

const contactBlock = `<h2>Contact us</h2>
<p>Questions about this policy can be sent to <a href="mailto:${EMAIL}">${EMAIL}</a>. We aim to reply within a few business days.</p>`;

// ---------------------------------------------------------------------------
// Terms of Service
// ---------------------------------------------------------------------------
const TERMS = `${updated}
<p>These terms govern your use of ${SITE} at <a href="${URL_}">${URL_}</a> (the "Site"), operated by ${ENTITY}. By using the Site you accept these terms. If you do not accept them, please do not use the Site.</p>

<h2>1. You must be an adult</h2>
<p>The Site is intended solely for adults. You may use it only if you are at least 18 years old, or older where your local law sets a higher age of majority for access to adult material. By using the Site you confirm that you meet that requirement and that adult material is lawful in the place you are accessing it from.</p>

<h2>2. What ${SITE} is</h2>
<p>${SITE} is an independent directory and deal-comparison service for adult subscription websites. We publish descriptions, reviews, category rankings, and discount information about third-party sites. We are not affiliated with, and do not operate, the sites we write about.</p>
<p>We do not host, produce, stream, or store adult media on the Site. Where a page shows promotional imagery or clips, that material is supplied by the site it advertises.</p>

<h2>3. Pricing and offer accuracy</h2>
<p>Prices, discount percentages, trial terms, and promotional availability are supplied by third parties and change frequently. We take reasonable care to keep them current, but we cannot guarantee that any offer shown is still available, still priced as displayed, or available in your country.</p>
<p>The terms that bind you are the ones presented by the third-party site at the moment you subscribe. Always check them before paying. If you spot an inaccuracy on our Site, please tell us at <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>

<h2>4. No billing relationship with us</h2>
<p>We never take payment for third-party subscriptions. All charges, renewals, refunds, and cancellations are handled by the third-party site or its payment processor. Requests to cancel a subscription or dispute a charge must go to that provider, not to us. Any cancellation guides we publish are informational only.</p>

<h2>5. Acceptable use</h2>
<p>You agree not to:</p>
<ul>
<li>use the Site in any way that breaks the law or infringes anyone's rights;</li>
<li>scrape, harvest, or systematically copy our content, or use automated tools to place unreasonable load on the Site;</li>
<li>attempt to gain unauthorised access to the Site, its accounts, or its infrastructure, or probe it for vulnerabilities without our written permission;</li>
<li>interfere with the Site's operation or security, or introduce malicious code;</li>
<li>misrepresent your age or identity in order to gain access.</li>
</ul>

<h2>6. Our content</h2>
<p>The text, layout, design, rankings, and editorial material we create are owned by ${ENTITY} or licensed to us, and are protected by intellectual property law. You may not reproduce or republish substantial parts of them without our written permission. Brand names, logos, and promotional media belong to their respective owners and appear here for identification and review purposes.</p>

<h2>7. Third-party links</h2>
<p>The Site links extensively to external websites. We do not control those sites and are not responsible for their content, pricing, security, data practices, or conduct. Following an external link is at your own risk, and the destination site's own terms and privacy policy will apply to you there.</p>

<h2>8. No warranties</h2>
<p>The Site is provided "as is" and "as available", without warranties of any kind, whether express or implied. We do not warrant that the Site will be uninterrupted, error-free, or secure, or that any information on it is complete, accurate, or current.</p>

<h2>9. Limitation of liability</h2>
<p>To the fullest extent permitted by law, ${ENTITY} will not be liable for any indirect, incidental, special, consequential, or punitive loss, or for any loss of profit, revenue, or data, arising out of your use of the Site or your dealings with any third-party site found through it. Nothing in these terms excludes liability that cannot lawfully be excluded.</p>

<h2>10. Changes to the Site and these terms</h2>
<p>We may change, suspend, or discontinue any part of the Site at any time. We may also update these terms; the "last updated" date above will change when we do. Continuing to use the Site after an update means you accept the revised terms.</p>

<h2>11. Governing law</h2>
<p>These terms are governed by the laws of ${JURISDICTION}, and the courts of ${JURISDICTION} will have jurisdiction over any dispute, except where mandatory local consumer law gives you a different right.</p>

${contactBlock}`;

// ---------------------------------------------------------------------------
// Privacy Policy
// ---------------------------------------------------------------------------
const PRIVACY = `${updated}
<p>This policy explains what personal information ${SITE} (<a href="${URL_}">${URL_}</a>), operated by ${ENTITY}, collects, why we collect it, and what rights you have. We have written it to be read, not to be impressive.</p>

<h2>The short version</h2>
<p>You do not need an account to use ${SITE}, and we do not ask you to tell us who you are. We do not sell your personal information. We do not receive any details of what you subscribe to on a third-party site, and we never see your payment details.</p>

<h2>What we collect</h2>
<p><strong>Information you send us.</strong> If you email us, we receive your address and whatever you write. We keep it only as long as needed to deal with your message and to keep a record of the exchange.</p>
<p><strong>Technical information collected automatically.</strong> When you visit, our servers and analytics tools may record your IP address, approximate location derived from it, browser and device type, operating system, referring page, the pages you viewed, and timestamps. This is used to keep the Site secure and to understand which content is useful.</p>
<p><strong>Cookies and similar technologies.</strong> See our <a href="/page/cookies/">Cookie Policy</a> for the detail, including how to refuse non-essential cookies.</p>
<p><strong>Affiliate click data.</strong> When you follow an outbound offer link, our affiliate partner may record that the click came from us, so any resulting commission is attributed correctly. We may learn that a referral converted, but we are not told who you are.</p>

<h2>What we do not collect</h2>
<p>We do not ask for your name, date of birth, or payment details. We do not build advertising profiles about you, and we do not knowingly collect information from anyone under 18. If you believe a minor has sent us personal information, contact us and we will delete it.</p>

<h2>Why we are allowed to process it</h2>
<p>Where data-protection law such as the GDPR applies, we rely on: your <em>consent</em> for non-essential cookies and analytics; our <em>legitimate interests</em> in keeping the Site secure, preventing fraud and abuse, and understanding aggregate usage; and <em>compliance with legal obligations</em> where we must retain or disclose information.</p>

<h2>Who we share it with</h2>
<p>We share personal information only with service providers who help us run the Site — hosting, content delivery and security, analytics, and email — and only as far as they need it to do that work. We may also disclose information where the law requires it, or to protect our rights, safety, or property. Some of these providers operate outside your country, and where that involves an international transfer we rely on appropriate safeguards.</p>
<p>We do not sell or rent personal information to anyone.</p>

<h2>How long we keep it</h2>
<p>Server and security logs are kept for a short operational period. Analytics data is retained in aggregate. Email correspondence is kept while it is relevant, and then deleted.</p>

<h2>Your rights</h2>
<p>Depending on where you live, you may have the right to ask us for a copy of your personal information, to correct or delete it, to object to or restrict how we use it, to withdraw consent, and to receive it in a portable form. You may also complain to your local data-protection authority. To exercise any of these, email <a href="mailto:${EMAIL}">${EMAIL}</a>. We may need to ask for information to locate your records, and we will respond within the period the law allows.</p>

<h2>Security</h2>
<p>The Site is served over encrypted connections and we apply reasonable technical and organisational measures to protect the limited data we hold. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.</p>

<h2>Changes to this policy</h2>
<p>If we change this policy we will update the date above, and for significant changes we will make that clear on the Site.</p>

${contactBlock}`;

// ---------------------------------------------------------------------------
// Cookie Policy
// ---------------------------------------------------------------------------
const COOKIES = `${updated}
<p>This policy explains how ${SITE} (<a href="${URL_}">${URL_}</a>) uses cookies and similar technologies, and how you can control them.</p>

<h2>What cookies are</h2>
<p>A cookie is a small text file a website asks your browser to store. It lets the site remember things between page views — such as your preferences — and lets us measure how the Site is used. Related technologies such as local storage and pixels work similarly, and we treat them the same way in this policy.</p>

<h2>Categories we use</h2>
<p><strong>Strictly necessary.</strong> Needed for the Site to work — routing, load balancing, security, remembering your language, and recording your cookie choice so we do not ask again on every page. These cannot be switched off through the Site, because without them it would not function.</p>
<p><strong>Preferences.</strong> Remember choices you have made, such as light or dark appearance, so the Site looks the way you left it.</p>
<p><strong>Analytics.</strong> Help us understand, in aggregate, which pages are read, which offers are useful, and where the Site is slow or broken. We use this to decide what to improve. These are optional.</p>
<p><strong>Affiliate attribution.</strong> When you click through to a third-party offer, the destination site or its affiliate network usually sets a cookie so any subsequent subscription is credited to us. That cookie is set by them, under their policy, not by us.</p>
<p>We do not use cookies to build advertising profiles or to serve behavioural adverts on this Site.</p>

<h2>First-party and third-party cookies</h2>
<p>First-party cookies are set by ${SITE}. Third-party cookies are set by other organisations — chiefly our analytics provider and the affiliate networks behind the offers we list. We do not control third-party cookies, and you should consult those organisations' own policies to understand them.</p>

<h2>How to control cookies</h2>
<p>You can refuse or withdraw consent for non-essential cookies at any time using the cookie controls on the Site. You can also manage cookies in your browser: every major browser lets you block or delete them, and offers a private-browsing mode that discards them when you close the window. Look under Settings, then Privacy.</p>
<p>Blocking all cookies is your choice, but be aware that strictly necessary cookies are what make the Site work — disabling them may break parts of it.</p>

<h2>Changes to this policy</h2>
<p>We will update the date above whenever this policy changes.</p>

${contactBlock}`;

// ---------------------------------------------------------------------------
// Adult Content Disclaimer
// ---------------------------------------------------------------------------
const DISCLAIMER = `${updated}
<h2>This is an adult website</h2>
<p>${SITE} (<a href="${URL_}">${URL_}</a>) is intended for adults only. It contains written descriptions of sexually explicit websites, and promotional imagery and video supplied by those websites. By continuing to use the Site you confirm all of the following:</p>
<ul>
<li>you are at least 18 years old, or older if your jurisdiction sets a higher age of majority for access to adult material;</li>
<li>viewing sexually explicit material is legal where you are;</li>
<li>you are accessing the Site voluntarily, for your own private use, and you will not make it available to anyone under the age of majority;</li>
<li>you will not find explicit material offensive, and you accept full responsibility for your own choice to view it.</li>
</ul>
<p>If any of these is not true, please leave the Site now.</p>

<h2>We do not host adult content</h2>
<p>${SITE} is a directory and review service. We do not produce, host, stream, or store adult media. All promotional images and clips shown on the Site are provided by the third-party websites they advertise, and remain the property and responsibility of those websites or their licensors.</p>

<h2>Records-keeping and performer age</h2>
<p>Because we neither produce nor host visual depictions of actual sexually explicit conduct, records-keeping obligations for such material rest with the producers of that content — that is, the third-party sites we link to. Each of those sites is responsible for its own compliance and for publishing its own compliance statement. Every site we feature is expected to verify that all performers were adults at the time of production.</p>

<h2>Third-party sites</h2>
<p>Following a link from ${SITE} takes you to a website we do not control. We are not responsible for its content, legality, security, or business practices, and its own terms and policies will govern your use of it. Judge each site on its own merits before subscribing.</p>

<h2>Parental controls</h2>
<p>If children have access to your device, we encourage you to use parental-control or content-filtering software to restrict access to adult material.</p>

<h2>Reporting a concern</h2>
<p>If you believe we have linked to material that is unlawful, non-consensual, or that involves a minor, tell us immediately at <a href="mailto:${EMAIL}">${EMAIL}</a> with the page address and details. We treat such reports as urgent, will remove the link while we investigate, and will report the matter to the relevant authorities and the hosting site where appropriate.</p>`;

// ---------------------------------------------------------------------------
// Affiliate Disclaimer
// ---------------------------------------------------------------------------
const AFFILIATE = `${updated}
<h2>How ${SITE} makes money</h2>
<p>${SITE} is free to use, and we make money through affiliate commission. Many of the outbound links on this Site — including offer buttons, discount links, and links inside reviews and rankings — are affiliate links. If you follow one and then subscribe, the site typically pays us a commission or a share of the revenue.</p>
<p>This costs you nothing. You pay the same price you would have paid going direct, and in many cases you pay less, because the discounts we negotiate or surface are only available through our links.</p>

<h2>What this does not change</h2>
<p>Commission does not buy a good review, a high ranking, or a place on the Site. Specifically:</p>
<ul>
<li>scores and rankings are based on our own assessment — content quality and volume, update frequency, video quality, site usability, and value for money;</li>
<li>we describe drawbacks as well as strengths, and we say so when we think an offer is poor value;</li>
<li>we list sites that pay us nothing where they are relevant to readers;</li>
<li>a higher commission rate does not move a site up a list.</li>
</ul>
<p>That said, you should know that a commercial relationship exists, and weigh our recommendations accordingly. Read widely and judge for yourself before you subscribe.</p>

<h2>Sponsored and paid placements</h2>
<p>Where a placement is paid for rather than editorially chosen, we label it as sponsored or advertising. If a page is not labelled that way, it reflects our editorial judgement.</p>

<h2>Prices and availability</h2>
<p>Offers change often. Prices, discounts, and trial terms shown here can become out of date, and some offers are limited by country or by time. Always confirm the current terms on the destination site before paying. See our <a href="/page/terms/">Terms of Service</a> for more on offer accuracy.</p>

<h2>Questions</h2>
<p>If anything about our commercial relationships is unclear, or you think a page is insufficiently labelled, email <a href="mailto:${EMAIL}">${EMAIL}</a>. We would rather fix it.</p>`;

const PAGES = [
  { slug: 'terms', content: TERMS },
  { slug: 'privacy', content: PRIVACY },
  { slug: 'cookies', content: COOKIES },
  { slug: 'disclaimer', content: DISCLAIMER },
  { slug: 'affiliate-disclaimer', content: AFFILIATE },
];

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

async function put(documentId, data, label) {
  const res = await withRetry(
    () =>
      fetch(`${STRAPI_URL}/api/pages/${documentId}`, {
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

const all = await api('/pages?fields[0]=slug&fields[1]=metaTitle&fields[2]=content&pagination[pageSize]=100&status=draft');
const bySlug = new Map(all.data.map((p) => [p.slug, p]));
let written = 0;

console.log('— policy content —');
for (const { slug, content } of PAGES) {
  const page = bySlug.get(slug);
  if (!page) { console.log(`! ${slug}: page not found in Strapi, skipped`); continue; }

  const existing = (page.content ?? '').trim();
  if (existing && !FORCE) {
    console.log(`= ${slug}: already has ${existing.length} chars, left alone (use --force to replace)`);
    continue;
  }

  console.log(`${APPLY ? '~' : '?'} ${slug}: ${existing.length} -> ${content.length} chars`);
  if (APPLY) { await put(page.documentId, { content }, `page ${slug}`); written += 1; }
}

// The layout's title template appends "| PornMode", so a metaTitle ending in "— PornMode" doubled it.
console.log('\n— metaTitle de-duplication —');
for (const page of all.data) {
  const cleaned = (page.metaTitle ?? '').replace(/\s*[—–-]\s*PornMode\s*$/, '').trim();
  if (!page.metaTitle || cleaned === page.metaTitle) { console.log(`= ${page.slug}: nothing to strip`); continue; }
  console.log(`${APPLY ? '~' : '?'} ${page.slug}: "${page.metaTitle}" -> "${cleaned}"`);
  if (APPLY) { await put(page.documentId, { metaTitle: cleaned }, `metaTitle ${page.slug}`); written += 1; }
}

console.log(
  APPLY
    ? `\nDone — ${written} field update${written === 1 ? '' : 's'}.\n\n⚠️  [LEGAL ENTITY] and [JURISDICTION] placeholders remain in the bodies, and the text needs review by a qualified lawyer.`
    : `\nDry run only. Re-run with --apply to write.`,
);
