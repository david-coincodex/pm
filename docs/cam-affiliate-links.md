# Cam affiliate links — how the money links are built, used and verified

Every outbound click to a cam provider goes through ONE redirect route and is built from ONE
saved template per provider. This is the revenue path: nothing may link to a provider any
other way.

## The redirect route (our "/offer/" for models)

`/out/model/<site>/<username>/` (full provider name — e.g. `/out/model/chaturbate/vesia/`;
the short ids `cb`/`bc` are internal data keys and never appear in URLs or analytics) —
`frontend/src/app/out/model/[site]/[username]/route.ts`

- **Instant 302** (no interstitial, unlike `/offer/`), target built from the provider's saved
  template — never from feed-row fields, so online, offline and registry-only models all get
  the identical, deterministic link.
- Counts a server-side `cam_click` GA4 event first (this audience blocks gtag — the redirect
  hop is the only reliable counter; lesson from `/offer/`, issue #14).
- Unknown models (not live, not in the registry) **404 without firing an event** — garbage
  URLs must not pollute click metrics. One deliberate nuance: when the registry is
  UNREACHABLE (as opposed to answering "missing"), an offline unknown username fails OPEN —
  it redirects and counts — because a CMS blip must never break real clicks.
- Kept out of the index twice over, like `/offer/`: robots.txt disallows `/out/`, and every
  response carries `X-Robots-Tag: noindex` (a redirect has no HTML for a meta tag — the
  header is its equivalent). Excluded from the proxy matcher.

## The saved templates (one per provider)

Templates live in the provider adapters — `frontend/src/lib/cams/providers/*.ts`, method
`outboundUrl(username)` (the `CamProviderAdapter` interface makes it mandatory for every
future provider).

### Chaturbate (`cb`)

```
https://chaturbate.com/in/?tour=YrCr&campaign={CHATURBATE_WM}&track=default&room={username}
```

- `{username}` = the feed username exactly as we store it (also our URL segment).
- `tour=YrCr` per the 2026-09 campaign update (#69; previously `YrCp`). Both resolve to
  `/gotoroom/` **with `fallback=toproom`** — a room that went offline between page render and
  click still lands on the top room, monetized. The feed's own `chat_room_url_revshare` uses
  `tour=LQps` (no fallback); we deliberately don't use it.
- Env: `CHATURBATE_WM` (server-only).

### BongaCams (`bc`)

```
https://bngprm.com/promo.php?type=direct_link&v=2&c={BONGACAMS_CAMPAIGN}&models[]={username}
```

- `{username}` = the feed username **verbatim — do NOT lowercase or slugify**. Verified live:
  `models[]` accepts mixed case and digits (`2Laski2`, `CarmellaAngel`); bngprm answers
  `302 → bongacams.com/track?c={campaign}&ps=direct_link&csurl=https://bongacams.com/{username}`,
  which is the attribution hop. (BongaCams' own marketing examples show lowercase-hyphen
  slugs like `tina-love-`; both forms resolve — we use the username we already have.)
- Env: `BONGACAMS_CAMPAIGN` (server-only).

## Where the redirect MUST be used (and is)

Every user-facing outbound surface links `routes.camOut(provider, username)` — never a raw
provider URL:

| Surface | File |
|---|---|
| "Chat" / "View X on {provider}" header button | model page → `CamCtaLink` |
| Player link-out facade (offline / stream-less models) | `CamPlayer` |
| **Live embed click-through** (a transparent overlay over the PLAYING stream) | `CamPlayer` |
| Anything future | **must** use `routes.camOut` — grep gate below |

The live embed is monetized too: a transparent `/out/` overlay covers the playing surface so a
click on the picture counts and redirects, exactly like the facade. For BongaCams the control
bar sits ABOVE the overlay (z-20) so mute/fullscreen still work and only a picture click leaves;
the Chaturbate iframe is fully covered (its muted autoplay is a preview — any click goes through
/out/). NOT internal-nav surfaces: cards, breadcrumb, "Next", the favorites strip and the models
sitemap all link `routes.camModel` (our page), never `/out/`. The `affiliateUrl` field on
`CamModel` is template-built, so no code path can leak an untagged link either.

**Grep gate** (run after touching cam components; must return nothing):

```
grep -rn 'chaturbate\.com\|bongacams\.com\|bngprm\.com' frontend/src/components frontend/src/app \
  | grep -v 'app/out/model' | grep -v thumb.live.mmcdn
```

## Adding a provider — checklist

1. Get the affiliate deep-link template from the provider's dashboard (their "direct link" /
   "room link" generator), with the campaign id as an env var (server-only, never `NEXT_PUBLIC_`).
2. Implement `outboundUrl(username)` in the new adapter — the interface forces it.
3. **Verify before shipping (this is how we make money):**
   - Pull 2–3 LIVE usernames from the feed, including one with digits/mixed case.
   - `curl -sI '<template with real username>'` — follow each hop (`redirect: manual`):
     confirm the campaign id survives every hop and the final `Location`/landing references
     the exact model requested. Provider bot-walls may 403 the last hop for curl — the
     attribution hop before it is what must be correct.
   - Check what happens for an OFFLINE username (dead end vs fallback) — prefer templates
     with a monetized fallback (see Chaturbate's `tour=YrCr`).
   - Then verify through our route: `curl -so /dev/null -w '%{redirect_url}' \
     http://localhost:3002/out/model/<site>/<username>/` must equal the template output.
4. Run the grep gate above.

## Current verified state (2026-09-02, live probes)

- `/out/model/chaturbate/vesia/` → `302 https://chaturbate.com/in/?tour=YrCr&campaign=y98oG&track=default&room=vesia` ✓
- `/out/model/bongacams/CarmellaAngel/` → `302 https://bngprm.com/promo.php?type=direct_link&v=2&c=660500&models[]=CarmellaAngel` ✓
- Offline registry-only model → same template ✓ · garbage username → 404, no event ✓
- Zero raw provider hrefs outside the adapters ✓
