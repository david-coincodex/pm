## Structure: General topical toplist (e.g. "Best Teen Pornstars in 2026")

A ranked editorial toplist on a topic. Entries may be people, sites, or things — many will NOT be sites in our catalog, so most entries are plain text. Embed our site widgets only where an entry (or a recommendation) maps to a catalog site. Order:

1. **Intro** (`<p>`, 1–2 paragraphs)
   - Set up the topic and why it matters in the current year.
   - Explain how the ranking was compiled (sources + our editorial criteria).

2. **Optional SiteList** — if several catalog sites are relevant to the topic (e.g. where to watch these performers), add one `site-card-list` of those catalog sites. Skip if not relevant.

3. **Ranked entries** (up to `maxEntries`)
   - `<h2>` like `1. <Name>` then 1–2 `<p>` describing the entry, grounded in the sources.
   - Where an entry is strongly associated with one of our catalog sites, you MAY add a `site-card` for that site and a CTA to its deal (only with a provided offer URL). Otherwise keep it plain text.

4. **Conclusion / Verdict** (`<h2>` + `<p>`) — wrap-up and standout pick.

5. **FAQs** (in the `faqs` array): topical questions + "how we made this list", "what are our criteria".

Editorial, skimmable, exactly ~`maxEntries` ranked entries. Never fabricate facts about real people — keep claims general and grounded in the provided sources.
