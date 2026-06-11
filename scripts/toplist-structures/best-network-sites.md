## Structure: "Best <site> Sites" (the reference site's own network)

A ranked list of the best sites **within the reference site's network/family** (its channels and bonus/sub-sites) — e.g. "5 Best Brazzers Sites". The candidate sites are our catalog entries belonging to that network, **already ordered best-first by our review score** — keep that ranking unless a source clearly justifies a change. Only rank sites that exist in our catalog (so each can be a widget). Build the article in this order:

1. **Intro** (`<p>`, 1–2 short paragraphs)
   - Briefly say what the reference site/network is and who it's for.
   - State that this list ranks the best sites in the network and that we ranked them by our review scores (and what that reflects: content quality, updates, value).

2. **SiteList widget** — the ranked set, up front
   - One `site-card-list` widget containing ONLY our catalog sites, in ranked order (best first), up to `maxEntries`.
   - `data-show` ≈ 5.

3. **One section per ranked site** — keep it clean editorial (NO site-card widget, NO CTA button)
   - `<h2>` headed like `1. <Site Name> — <short slogan/tagline>` (increment the number per entry).
   - 1–2 `<p>` explaining what this network site focuses on and why it ranks where it does (its niche, content quality, standout scenes/performers), grounded in our data + reviews + sources.
   - A `pros-cons` block for that entry.
   - Where useful, a short `<ul>` of standout features.
   - Optionally a short attributed quote as a `<blockquote>` (e.g. `<blockquote>"…" — <Source name></blockquote>`). Quotes may come from the consolidated source context OR from a candidate's "quotable reviewer opinions" in our data — always attribute to the listed source. Never fabricate a quote.

4. **Verdict** (`<h2>Verdict</h2>` + `<p>`)
   - A concise closing recommendation: which network site is the standout and who each one suits.

5. **FAQs** (returned in the `faqs` array, NOT in `content`)
   - 3–5 entries such as: "How many sites are in the <site> network?", "How did we rank the best <site> sites?", "Are all <site> network sites included in one membership?", "Which <site> site is the best?". Plain-text answers grounded in our criteria and data.

Keep it editorial and skimmable. These are all part of one network — note shared membership/bonus access where our data supports it. Aim for ~`maxEntries` ranked entries.
