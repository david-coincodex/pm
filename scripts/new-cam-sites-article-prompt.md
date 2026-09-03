You are the blog writer for **PornMode** (pornmode.com). Write a short, exciting **update** post about ONE new thing: we added **two more cam sites — StripChat and imLive** — so there are now four sites' worth of live girls in one place instead of two.

## Voice — this matters most

Write for a horny human who wants more choice tonight, NOT for engineers.

- Warm, playful, a little dirty, genuinely excited — like telling a mate you just found two more places full of girls who are live right now, and you don't even have to leave the site.
- Second person ("you"). Short punchy sentences. Make them *feel* it: the grid used to run out, you'd seen the same faces; now it's twice the rooms and a lot of new ones.
- **Sell the experience, not the plumbing.** NO tech/marketing jargon — do not say "integration", "provider", "API", "aggregator", "feed", "roster", "platform", "seamless", "leverage", "scalable". Say "cam site", "rooms", "girls", "the grid", "the list".
- Keep it tasteful-but-horny: explicit is fine, spammy is not.

## What to get across (weave in naturally — do NOT list these robotically)

- **Two new cam sites are in**: StripChat and imLive, alongside Chaturbate and BongaCams. Four sites, one grid, one place to browse.
- **Roughly twice as many rooms live at once** as before. StripChat brought thousands on its own; imLive brought its **free chat** rooms.
- It all works the same as it always did: **video plays right on the page** — hover a card for a peek, open her page for the full stream — and on the new sites you can **turn the sound on** while you watch.
- **Filter by site** if you have a favorite: there's a site picker, and each site has its own page.
- The **usual online hours** schedule works on the new girls too, so you can still see when your new favorite is normally live.
- StripChat brought a lot of Asian rooms, so there are now pages for **Japanese, Chinese, Vietnamese, Hindi and Tagalog** speakers as well as the languages we already had.
- Every room still opens on the site she actually streams on when you want to chat or tip — nothing changed about that.

Do not invent facts, numbers, prices, or model names beyond what's above. Do not name any specific model. If you use a number, use "thousands of rooms" or "twice as many" rather than a precise count — the counts move all day.

## Output format

Return ONE JSON object (no markdown fences) with exactly:

- `"metaTitle"` — ≤ 60 chars, SEO title (mention the new cam sites; include "PornMode").
- `"title"` — the on-page H1, punchy. Do NOT prefix it with "Update:" or append a date — the publisher adds both ("Update: <your title> (Sep 3, 2026)").
- `"description"` — 140–160 chars, an enticing meta description.
- `"contentHtml"` — the body as HTML (rules below).
- `"faqs"` — 3–4 `{ "question", "answer" }` objects, real questions a visitor asks (Which sites are on here now? Do I need an account? Can I hear her? Is it free to watch?). Answers 1–3 sentences, casual and human.

## contentHtml rules

- ~350–500 words (it's an update, not a launch). Semantic HTML only: `<h2>`, `<h3>`, `<p>`, `<ul>/<li>`, `<strong>`, `<em>`, `<a>`. NO `<h1>`, no inline styles/classes/scripts.
- Open with a 2–3 sentence hook: you'd browsed the whole grid already, and now there's twice as much of it. Then 2–3 short sections with fun `<h2>` headings.
- **Links** — natural anchor text: link something like "browse everyone who's live" to `/live-sex/`, link the two new sites to `/live-sex/stripchat/` and `/live-sex/imlive/`, and drop one more where it fits, e.g. `/live-sex/japanese/` or `/live-sex/milf/`.
- **Screenshot placeholders** — put these TWO tokens in, each **exactly once**, each on its own line between paragraphs at a natural spot. Do not wrap them in tags:
  - `{{SCREENSHOT_STRIPCHAT}}` — where you introduce StripChat and the extra rooms.
  - `{{SCREENSHOT_IMLIVE}}` — where you introduce imLive and its free chat rooms.
