#!/usr/bin/env node
/**
 * generate-accounts-article.mjs
 *
 * The ANNOUNCEMENT blog article for free accounts + model favorites, written into local Strapi.
 * Mirrors generate-launch-article.mjs, but the copy is hand-written (in the PornMode voice) and
 * the two screenshots are pre-captured to /tmp/pm-accounts-article (the favorites shot needs a
 * logged-in session, which the shared Playwright helper cannot do).
 *
 * Idempotent by slug: re-running UPDATES in place (keeps postId / the /blog/<postId>/<slug>/ URL).
 *
 * Usage:  node scripts/generate-accounts-article.mjs [--dry-run]
 * Env (scripts/.env): STRAPI_URL, STRAPI_TOKEN.
 * Pre-req: /tmp/pm-accounts-article/{signup,favorites}.png captured beforehand.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { mkdirSync } from 'fs';

import {
  STRAPI_URL, TOKEN, requireToken,
  api, articlesBySlug, createArticle, updateArticle, uploadLocalFile,
} from './lib/strapi.mjs';
import { buildCover } from './lib/cover-image.mjs';

const _require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
_require('dotenv').config({ path: `${__dirname}/.env`, quiet: true });

const DRY_RUN = process.argv.includes('--dry-run');
const SLUG = 'save-favorite-cam-models';
const AUTHOR_SLUG = 'mike-wood';
const CATEGORY_SLUG = 'live-sex';
const SHOTS_DIR = '/tmp/pm-accounts-article'; // where the screenshots were captured

const META = {
  metaTitle: 'Save Your Favorite Cam Models | PornMode',
  title: 'Update: Save the Ones You Love. Favorites Are Here. (Sep 9, 2026)',
  description:
    "Make a free PornMode account, heart the cam models you love, and see who's live the second you open your favorites. Never lose her in the grid again.",
};

/** Body with {{SIGNUP}} / {{FAVORITES}} markers the script fills with real uploaded figures. */
const BODY = `
<p>You know the feeling. You stumble onto her — the exact girl, the one who does the thing, live right this second — and it is perfect. Then the tab closes, or she logs off, and she is gone. Somewhere in a grid of thousands. Good luck ever finding her again.</p>
<p>Not anymore. PornMode now has <strong>free accounts</strong> and <strong>favorites</strong>. Find a model you love, tap the heart, and she is yours to come back to — every single time.</p>
{{SIGNUP}}
<h2>Thirty Seconds to Never Losing Her</h2>
<p>Making an account is quick and free. Drop in your email, or just tap <strong>Continue with Google</strong> and you are in. No forms, no hassle, no card. You are back to the good stuff before you have finished thinking about her.</p>
<p>And it is <em>your</em> account on PornMode — nothing to do with any cam site. You still watch everyone for free without it. The account is only so the site can remember who you love.</p>
<h2>Tap the Heart. She's Saved.</h2>
<p>See the little heart on every model? Tap it. That is the whole trick. She drops straight into your favorites — Chaturbate, BongaCams, StripChat, ImLive, does not matter where she streams. One list, all your girls, in one place.</p>
<p>Do it while you browse. Do it mid-scroll. Do it to the one you swear you will remember and then always forget. The heart never forgets.</p>
{{FAVORITES}}
<h2>Open Your Favorites, See Who's Live</h2>
<p>Here is the part that changes everything. Open <a href="/live-sex/?fav=1">your favorites</a> and the girls who are <strong>live right now</strong> float to the top — glowing, streaming, waiting. The ones who are offline sit quietly below, so you always know exactly who you can watch this second.</p>
<p>No more hunting. No more "what was her name again". Just your people, with a bright green light on the ones who are on.</p>
<h2>She's Not On Yet? Now You Know When She Will Be</h2>
<p>Favorites get even better paired with the thing we added last week: every model page shows <a href="/live-sex/">when she is usually online</a>, hour by hour, in your own local time. Heart her, learn her hours, and show up exactly when she does. Miss her less. Catch her more.</p>
<h2>Yes, On Your Phone Too</h2>
<p>Same hearts, same list, same login on mobile. Save her from the couch, open your favorites on the train, watch her the second she comes on. Wherever you are, your girls come with you.</p>
<p>Ready? <a href="/live-sex/">Go find someone worth saving</a> — your usual type, or wander somewhere filthier like <a href="/live-sex/milf/">MILF cams</a>, <a href="/live-sex/big-tits/">big tits cams</a> or <a href="/live-sex/trans/">trans cams</a>. Tap the heart on the ones who get you. They will be right there waiting next time.</p>
`.trim();

const FAQS = [
  { question: 'Do I need an account to watch the cams?', answer: 'No. You can watch every live model for free without signing up. An account is only so PornMode can save your favorites and remember who you love.' },
  { question: 'Is it free to make an account?', answer: 'Completely free — no card, no catch. Sign up with your email or your Google account in about thirty seconds.' },
  { question: 'How do I save a model?', answer: 'Tap the little heart on her card or her page and she drops into your favorites instantly, from any cam site. Tap it again to remove her.' },
  { question: 'How do I see which of my favorites are live?', answer: 'Open your favorites and the ones streaming right now are shown first, with a live badge. Offline models sit below, so you always know exactly who you can watch this second.' },
];

const figure = ({ url, width, height, alt, caption }) =>
  `<figure><img src="${url}"${width ? ` width="${width}"` : ''}${height ? ` height="${height}"` : ''} alt="${alt}" loading="lazy" /><figcaption>${caption}</figcaption></figure>`;

async function resolveDocId(collection, slug) {
  const json = await api(`/${collection}?filters[slug][$eq]=${encodeURIComponent(slug)}&fields[0]=slug`);
  return json.data?.[0]?.documentId ?? null;
}

async function deleteOldMediaByName(name, keepId) {
  const json = await api(`/upload/files?filters[name][$eq]=${encodeURIComponent(name)}`);
  const files = Array.isArray(json) ? json : json.results ?? json.data ?? [];
  for (const f of files) {
    if (f.id === keepId) continue;
    await fetch(`${STRAPI_URL}/api/upload/files/${f.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } }).catch(() => {});
  }
}

async function main() {
  if (!DRY_RUN) requireToken();

  if (DRY_RUN) {
    console.log('── DRY RUN ─────────────────────────────');
    console.log('metaTitle:', META.metaTitle);
    console.log('title:', META.title);
    console.log('description:', META.description, `(${META.description.length} chars)`);
    console.log('body:', BODY.length, 'chars ·', (BODY.match(/<h2>/g) || []).length, 'sections ·', FAQS.length, 'faqs');
    console.log('markers:', /\{\{SIGNUP\}\}/.test(BODY) && /\{\{FAVORITES\}\}/.test(BODY) ? 'OK' : 'MISSING');
    return;
  }

  mkdirSync(SHOTS_DIR, { recursive: true });
  console.log('Building cover…');
  const coverFile = join(SHOTS_DIR, 'cover.png');
  const cover = await buildCover({ outFile: coverFile });

  console.log('Uploading media…');
  const COVER_NAME = 'pornmode-accounts-cover.png';
  const coverUp = await uploadLocalFile(cover.file, COVER_NAME, 'image/png', 'image/');
  const signupUp = await uploadLocalFile(join(SHOTS_DIR, 'signup.png'), 'pornmode-accounts-signup.png', 'image/png', 'image/');
  const favUp = await uploadLocalFile(join(SHOTS_DIR, 'favorites.png'), 'pornmode-accounts-favorites.png', 'image/png', 'image/');

  const body = BODY
    .replace('{{SIGNUP}}', figure({ url: signupUp.url, width: signupUp.width, height: signupUp.height, alt: 'Creating a free account on PornMode', caption: 'One tap with Google, or your email — and you are in.' }))
    .replace('{{FAVORITES}}', figure({ url: favUp.url, width: favUp.width, height: favUp.height, alt: 'Your favorite cam models on PornMode', caption: "Your favorites, live girls first — and a clear label on the ones who are offline." }));

  const authorId = await resolveDocId('authors', AUTHOR_SLUG);
  if (!authorId) throw new Error(`author not found: ${AUTHOR_SLUG}`);
  const categoryId = await resolveDocId('categories', CATEGORY_SLUG);

  const bySlug = await articlesBySlug();
  const existing = bySlug.get(SLUG);
  const maxPostId = Math.max(0, ...[...bySlug.values()].map((a) => Number(a.postId) || 0));
  const postId = existing?.postId ?? maxPostId + 1;

  const data = {
    metaTitle: META.metaTitle,
    title: META.title,
    slug: SLUG,
    postId,
    description: META.description,
    content: body,
    coverImage: coverUp.id,
    author: authorId,
    publishDate: new Date().toISOString(),
    faqs: FAQS,
  };
  if (categoryId) data.categories = [categoryId];

  const saved = existing ? await updateArticle(existing.documentId, data) : await createArticle(data);

  await deleteOldMediaByName(COVER_NAME, coverUp.id);
  await deleteOldMediaByName('pornmode-accounts-signup.png', signupUp.id);
  await deleteOldMediaByName('pornmode-accounts-favorites.png', favUp.id);

  console.log(`\n✅ ${existing ? 'updated' : 'created'}: postId=${saved.postId} slug=${saved.slug}`);
  console.log(`   http://localhost:3002/blog/${saved.postId}/${saved.slug}/`);
}

main().then(() => process.exit(0)).catch((err) => { console.error('\n✗', err.message); process.exit(1); });
