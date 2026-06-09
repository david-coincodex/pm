## Structure: "Best <site> Alternatives / Ads"

A ranked list of the best alternatives to a reference site (sites users move to or compare against). Rank only catalog sites so each can be a widget. Order:

1. **Intro** (`<p>`)
   - One short paragraph on the reference site and why someone might want alternatives (price, content gaps, variety).
   - State what this list covers and the ranking basis.

2. **SiteList widget** — ranked alternatives up front (catalog IDs only, best first, ≤ `maxEntries`, `data-show` ≈ 5).

3. **One section per ranked alternative** — clean editorial (NO site-card widget, NO CTA button)
   - `<h2>` like `1. <Site Name> — <why it's a great alternative>`.
   - 1–2 `<p>` comparing it to the reference site (what it does better / differently), grounded in our data + sources.
   - A `pros-cons` block; optionally a short `<ul>` of features.
   - Optionally a short attributed quote as a `<blockquote>` — from the consolidated source context OR a candidate's quotable reviewer opinions in our data; attribute to the source, never fabricate.
   - Non-catalog entries → plain `<h2>`/`<p>`/`pros-cons`.

4. **Verdict** (`<h2>Verdict</h2>` + `<p>`) — top recommendation and who each alternative suits.

5. **FAQs** (in the `faqs` array): e.g. "Why look for alternatives to <site>?", "How did we rank these?", "Which alternative is cheapest/best value?".

Editorial, skimmable, ~`maxEntries` entries.
