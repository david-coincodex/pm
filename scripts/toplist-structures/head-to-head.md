## Structure: "<Site A> vs <Site B>" / "Difference Between <A> and <B>"

A two-way comparison. The reader already knows both names and is deciding between them, or is
confused about how they relate — often because they are siblings in the same family. Your job
is to make the distinction unmistakable, then point at whichever suits them.

Both sites come from `siteSlugs` in ranked order: the FIRST is A, the second is B. Never
compare against a third site, and never introduce alternatives — that is a different article.

Build the article in this order:

1. **The distinction, immediately** (`<p>`, 1–2 short paragraphs)
   - Lead with the single sentence that separates them. If a reader stops after one paragraph
     they should already have the answer.
   - Say plainly whether they are related (same studio/network) or unrelated competitors. If
     one is a sub-brand or spin-off of the other, say so — that is usually the actual question.

2. **SiteList widget** — both sites, A then B
   - One `site-card-list` with exactly the two catalog IDs, `data-show="2"`.

3. **`<h2>The short answer</h2>`** + one `<p>`
   - Two or three sentences: pick A if …, pick B if …. No hedging, no "it depends on you".

4. **A comparison `<table>`** — the highest-value element on this page
   - Header row: the dimension, then A's name, then B's name.
   - 5–8 rows on dimensions that genuinely differ: content focus, tone/intensity, production
     style, exclusivity, update frequency, catalogue size, who it suits.
   - Keep each cell to a few words. Do NOT put prices, discounts or trial terms in the table —
     figures live in widgets, which read live offers.

5. **`<h2><A name></h2>`** then **`<h2><B name></h2>`** — one section each
   - 2–3 `<p>` on what that site actually does well and who it is for, grounded in our data
     and the sources.
   - A `pros-cons` block for each — this is the one article type where per-entry pros/cons
     genuinely earn their space, because the reader is weighing exactly two things.
   - Optionally one short attributed `<blockquote>` per site, from the supplied context or a
     candidate's quotable reviewer opinions. Never fabricate a quote.

6. **`<h2>Which should you get?</h2>`** + 1–2 `<p>`
   - Resolve it. Name the better default choice and say who should pick the other instead.
   - If they are siblings and the honest answer is "the one that includes the other", say that.

7. **FAQs** (in the `faqs` array, NOT in `content`)
   - 3–5, grounded in the actual confusion: "Are <A> and <B> the same company?", "Does a <A>
     subscription include <B>?", "Which has more content?", "Can I get both?".

## Rules specific to this type

- **Never declare a winner on price.** Offers change; the widgets carry the live figures.
- **Do not invent a relationship.** If the supplied data does not establish that one owns or
  includes the other, do not assert it — say what is verifiable and stop.
- If one of the two is absent from our catalog, still write the full comparison, but that site
  gets no widget and no link. Do not substitute a different site for it.
