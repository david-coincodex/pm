## Structure: "Best <genre> Porn Sites"

A ranked list of sites serving one genre or style, drawn from across networks rather than from
one family. Use this when the grouping is editorial — a look, a tone, a production style — and
so cannot be derived from a parent/child relationship or a catalog category.

Candidates come from `siteSlugs` in the job, in the authored order, which is the intended
ranking. Do not reorder them and do not add sites that were not supplied.

Build the article in this order:

1. **Define the genre first** (`<p>`, 1–2 short paragraphs)
   - Say what actually distinguishes it, concretely — lighting, pacing, chemistry, how scenes
     are shot, what it avoids. A reader searching a genre term often cannot articulate it
     themselves, and naming it precisely is the reason to trust the list.
   - Then say what the list covers and how it was ranked.

2. **SiteList widget** — the ranked set, up front
   - One `site-card-list` with the supplied catalog IDs in the given order. `data-show` ≈ 5.

3. **One `<h2>` section per ranked site** — clean editorial, no per-entry widget, no CTA button
   - `<h2>` headed `1. <Site Name> — <short tagline naming what it does best>`, incrementing.
   - 1–2 `<p>` on how well it delivers THIS genre specifically. Not a general review — a site
     can be excellent and still be a poor fit for the genre, and saying so is the value here.
   - A `pros-cons` block per entry, with at least one con that is genre-relevant.
   - Optionally a short `<ul>` of standout features, or one attributed `<blockquote>` from the
     supplied context or a candidate's quotable reviewer opinions. Never fabricate a quote.

4. **`<h2>How we picked these</h2>`** + one `<p>`
   - The genre-specific criteria, so the ranking reads as reasoned rather than arbitrary.

5. **`<h2>Verdict</h2>`** + one `<p>` — the best all-round pick and who should choose otherwise.

6. **FAQs** (in the `faqs` array, NOT in `content`)
   - 3–5 grounded in the genre: what defines it, how it differs from the adjacent genre readers
     confuse it with, whether any of these are worth it for a casual viewer.

## Rules specific to this type

- **Every ranked entry must be a supplied catalog site.** If there are fewer sites than
  `maxEntries`, write fewer entries. Never pad the list with sites you were not given, and
  never invent an ID.
- **Do not describe a site as belonging to the genre if the supplied data does not support it.**
  A stretched fit undermines the whole list; leave it out or say plainly that it only partly fits.
- **No prices, percentages or trial terms in prose** — the widgets carry live figures.
