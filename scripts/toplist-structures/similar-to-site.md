## Structure: "Sites Similar to <site>"

A ranked list of alternatives/similar sites to a reference site. Only rank sites that exist in our catalog (so each can be a widget). Build the article in this order:

1. **Intro** (`<p>`, 1–2 short paragraphs)
   - Briefly say what the reference site is and who it's for.
   - State what this list covers (the best similar/alternative sites) and how we ranked them.

2. **SiteList widget** — the ranked set, up front
   - One `site-card-list` widget containing ONLY our catalog sites, in ranked order (best first), up to `maxEntries`.
   - `data-show` ≈ 5.

3. **One section per ranked site** — keep it clean editorial (NO site-card widget, NO CTA button)
   - `<h2>` headed like `1. <Site Name> — <short slogan/tagline>` (increment the number per entry).
   - 1–2 `<p>` explaining why it's a strong alternative to the reference site (content focus, quality, value), grounded in our data + sources.
   - A `pros-cons` block for that entry.
   - Where useful, a short `<ul>` of standout features.
   - Optionally a short attributed quote as a `<blockquote>` (e.g. `<blockquote>"…" — <Source name></blockquote>`). Quotes may come from the consolidated source context OR from a candidate's "quotable reviewer opinions" in our data — always attribute to the listed source. Never fabricate a quote.
   - If an entry is NOT in our catalog, still use plain `<h2>`/`<p>`/`pros-cons`.

4. **Verdict** (`<h2>Verdict</h2>` + `<p>`)
   - A concise closing recommendation: who should pick which site, and the standout top choice.

5. **FAQs** (returned in the `faqs` array, NOT in `content`)
   - 3–5 entries such as: "How do we pick similar sites?", "What criteria do we use?", "Is <reference site> still worth it?". Plain-text answers grounded in our criteria.

Keep it editorial and skimmable. Aim for ~`maxEntries` ranked entries.
