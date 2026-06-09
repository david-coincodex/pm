## Custom elements (CKEditor widgets)

Our renderer recognizes the following custom elements inside `content`. Emit them with the EXACT markup below. **Numeric site IDs may only come from the "Our site catalog" section of the user message.** If a ranked entry has no matching catalog site, write it as plain `<h2>`/`<p>` (no widget).

### SiteCard — one featured site
Use for a single highlighted site (e.g. the top pick, or inside a per-site section).
```html
<div data-component="site-card" data-site-id="ID" class="pm-widget" contenteditable="false"><span class="pm-widget__label">Site Card: NAME</span></div>
```

### SiteList — the ranked set of sites, up front
Use ONCE near the top to show the ranked list of our matching sites. `data-site-ids` is a comma-separated list of catalog IDs in ranked order; `data-show` is how many show before "show more".
```html
<div data-component="site-card-list" data-site-ids="ID1,ID2,ID3" data-show="5" class="pm-widget" contenteditable="false"><span class="pm-widget__label">Site List: NAME1, NAME2, NAME3</span></div>
```

### Pros / Cons — per entry (optional)
```html
<div class="pros-cons-block" data-component="pros-cons" data-pros="First pro||Second pro||Third pro" data-cons="First con||Second con" contenteditable="false"><div class="pros-cons-block__pros"><ul><li>First pro</li><li>Second pro</li><li>Third pro</li></ul></div><div class="pros-cons-block__cons"><ul><li>First con</li><li>Second con</li></ul></div></div>
```
- `data-pros` / `data-cons` are `||`-delimited (double pipe). Mirror the same items inside the `<ul>` lists.

### CTA button — link to the deal/offer (optional)
Use the offer/deal URL we provide for the site; omit if none is given.
```html
<a href="URL" class="inline-flex">Get the Deal</a>
```
The button styling is applied automatically by the `inline-flex` class — do not add other classes.

### Source quote (optional)
A short attributed quote drawn from EITHER the consolidated source context OR a candidate site's "quotable reviewer opinions" in our data:
```html
<blockquote>"Short quoted observation…" — <Source name></blockquote>
```
Only use quotes present in the provided context/our data, attributed to the listed source. Never fabricate a quote or attribution.

### Images — handled automatically
Do NOT add `<img>` tags. Our pipeline inserts one relevant image above each ranked-site `<h2>` (a matched source image, or the site's own cover as fallback).

## Usage guidance
- Follow the structure instructions for the requested type — they decide which elements to use.
- Put the **SiteList** near the top when the structure calls for it (the ranked set of our catalog sites).
- **SiteCard** and **CTA button** are only for structures that explicitly allow them (e.g. general topical lists). The "similar-to" / "alternatives" structures use clean editorial (prose, lists, pros/cons, quotes) — no SiteCard/CTA.
- Keep widgets and images on their own line; surround them with normal prose. Never wrap a widget in `<p>`.
