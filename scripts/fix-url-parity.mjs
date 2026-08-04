/**
 * Restore production URL parity for records whose identifier drifted during the WP migration.
 *
 * Two kinds of drift, same principle: fix the DATA so the production URL resolves directly, rather
 * than bolting on a redirect. Fewer moving parts, no hop, and nothing to maintain in a rules file.
 *
 *   sites    — production published some paysites as single-word slugs; the new CMS re-slugified them
 *              with a hyphen. This moves TWO URLs per site, since the review route reads `site.slug`.
 *   articles — an article imported under one WordPress post id where production's canonical copy has
 *              another. The blog route keys off `postId` and 308s any wrong slug to the canonical one,
 *              so correcting `postId` makes the production URL self-heal with no rule at all.
 *
 * Deliberately a PUT on the existing document — delete+create would reassign `documentId`, break every
 * relation pointing at it, and reset `publishedAt` (which orders /blog).
 *
 * Usage:
 *   node scripts/fix-url-parity.mjs              # dry run — reports what would change
 *   node scripts/fix-url-parity.mjs --apply      # perform the changes
 *
 * Env (scripts/.env): STRAPI_URL, STRAPI_TOKEN
 */

import { STRAPI_URL, TOKEN, requireToken, api } from './lib/strapi.mjs';
import { withRetry } from './lib/http.mjs';

/** Site slug: `to` is the production slug being restored. */
const SITE_SLUGS = [
  { from: 'team-skeet', to: 'teamskeet' },
  { from: 'adult-time', to: 'adulttime' },
];

/**
 * Article postId: `to` is production's canonical post id.
 *
 * 2736 -> 4239: production published this article twice (2736 on 2020-05-03, 4239 on 2020-11-13, same
 * title). Our copy was imported from 2736; 4239 is the later canonical. Note this trades one URL for
 * the other — after the change `/blog/2736/…` no longer resolves.
 */
const ARTICLE_POST_IDS = [
  { slug: 'hottest-ebony-pornstars', from: 2736, to: 4239 },
];

const APPLY = process.argv.includes('--apply');

async function put(collection, documentId, data, label) {
  const res = await withRetry(
    () =>
      fetch(`${STRAPI_URL}/api/${collection}/${documentId}`, {
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
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${STRAPI_URL}\n`);
let changed = 0;

console.log('— site slugs —');
for (const { from, to } of SITE_SLUGS) {
  const found = await api(`/sites?filters[slug][$eq]=${from}&fields[0]=slug&fields[1]=name&status=draft`);
  const site = found.data[0];

  if (!site) {
    const target = await api(`/sites?filters[slug][$eq]=${to}&fields[0]=slug&status=draft`);
    console.log(target.data.length ? `= ${from} -> ${to}: already applied` : `! ${from}: not found, skipped`);
    continue;
  }
  // A collision would make Strapi silently re-slugify to `<to>-1`, which is worse than failing.
  const clash = await api(`/sites?filters[slug][$eq]=${to}&fields[0]=slug&status=draft`);
  if (clash.data.length) {
    console.log(`! ${from} -> ${to}: target slug already in use, skipped`);
    continue;
  }

  console.log(`${APPLY ? '~' : '?'} ${site.name}: ${from} -> ${to}`);
  console.log(`    /discounts/${from}/ -> /discounts/${to}/`);
  console.log(`    /reviews/${from}/   -> /reviews/${to}/`);
  if (APPLY) {
    const updated = await put('sites', site.documentId, { slug: to }, `site ${from}`);
    if (updated.slug !== to) throw new Error(`${from}: Strapi stored "${updated.slug}", expected "${to}"`);
    changed += 1;
  }
}

console.log('\n— article post ids —');
for (const { slug, from, to } of ARTICLE_POST_IDS) {
  const found = await api(`/articles?filters[slug][$eq]=${slug}&fields[0]=slug&fields[1]=postId&status=draft`);
  const article = found.data[0];

  if (!article) { console.log(`! ${slug}: not found, skipped`); continue; }
  if (article.postId === to) { console.log(`= ${slug}: already postId ${to}`); continue; }
  if (article.postId !== from) {
    console.log(`! ${slug}: expected postId ${from} but found ${article.postId}, skipped`);
    continue;
  }
  // Two articles sharing a postId would make /blog/<id>/ ambiguous.
  const clash = await api(`/articles?filters[postId][$eq]=${to}&fields[0]=slug&status=draft`);
  if (clash.data.length) {
    console.log(`! ${slug}: postId ${to} already used by ${clash.data[0].slug}, skipped`);
    continue;
  }

  console.log(`${APPLY ? '~' : '?'} ${slug}: postId ${from} -> ${to}`);
  console.log(`    /blog/${to}/<any-slug>/ now 308s to /blog/${to}/${slug}/`);
  console.log(`    /blog/${from}/${slug}/ stops resolving`);
  if (APPLY) {
    const updated = await put('articles', article.documentId, { postId: to }, `article ${slug}`);
    if (updated.postId !== to) throw new Error(`${slug}: Strapi stored ${updated.postId}, expected ${to}`);
    changed += 1;
  }
}

console.log(
  APPLY
    ? `\nDone — ${changed} record${changed === 1 ? '' : 's'} updated.`
    : `\nDry run only. Re-run with --apply to perform the changes.`,
);
