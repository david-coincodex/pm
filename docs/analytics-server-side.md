# Server-side analytics (GA4 Measurement Protocol)

Affiliate clicks are counted **on the server**, not in the browser. gtag.js is blocked for a large
share of this audience, so the client-side count was structurally short — and clicks are the one
number the whole funnel is judged on. These hits leave our Node process, so nothing on the
visitor's machine can refuse them.

Implementation: [`frontend/src/lib/serverAnalytics.ts`](../frontend/src/lib/serverAnalytics.ts).
Client-side gtag still exists for page views and UI events — see `frontend/src/lib/analytics.ts`.

## What is tracked

| Event | Fires when | Where |
|---|---|---|
| `offer_click` | a visitor lands on `/offer/<id>/`, the interstitial that redirects to the affiliate | `frontend/src/app/[locale]/(bare)/offer/[id]/page.tsx` |

Parameters on every server event:

| Parameter | Example | Notes |
|---|---|---|
| `offer_id` | `89` | Strapi offer id |
| `site_slug` | `darkx` | the site being clicked through to |
| `site_name` | `DarkX` | |
| `offer_type` | `monthly` | `trial` / `monthly` / `quarterly` / `yearly` / `lifetime` / `credits` |
| `offer_price` | `9.95` | deliberately **not** `value`, which GA treats as revenue — this is the visitor's spend at the merchant, not ours |
| `country` | `DE` | from Cloudflare's `CF-IPCountry`. **Read the geo limitation below — this is the only trustworthy geo signal on these events** |
| `cookie_state` | `present` / `blocked` | whether the visitor's GA cookies existed, i.e. how much volume gtag was missing |

## Setup (one-time, in the GA4 UI)

### 1. Create a Measurement Protocol API secret

GA4 → **Admin** → **Data streams** → pick the web stream → **Measurement Protocol API secrets** →
**Create**. Copy the secret value.

### 2. Store it

- **Staging/production:** add a GitHub repo secret named `GA_API_SECRET`. The deploy workflow
  writes it into the server's `.env`, and `docker-compose.staging.yml` passes it to the frontend
  container. Until that secret exists the value is empty and server events silently no-op.
- **Locally:** `GA_API_SECRET=… docker compose up -d frontend`, or add it to your shell env.
  With it unset, `trackServerEvent` warns once per call in development and sends nothing — local
  traffic can never reach the live property by accident.

It is **not** a `NEXT_PUBLIC_` variable, deliberately: that prefix ships the value to the browser,
and anyone could then forge hits into the property.

### 3. Register the parameters as custom dimensions

GA4 shows nothing for custom event parameters until they are registered. GA4 → **Admin** →
**Custom definitions** → **Create custom dimension**, scope **Event**, once per parameter:

| Dimension name | Event parameter |
|---|---|
| Offer ID | `offer_id` |
| Site slug | `site_slug` |
| Site name | `site_name` |
| Offer type | `offer_type` |
| Country (Cloudflare) | `country` |
| Cookie state | `cookie_state` |

Registration is not retroactive — data only appears from the moment the dimension exists, so do
this before you start caring about the numbers.

## The two limitations worth understanding

**Geo and device are wrong on server events, and cannot be fixed.** GA4 derives country, city,
browser and device from the IP and User-Agent of whoever sent the hit — which here is our server in
Germany. GA4's Measurement Protocol has **no** IP-override field (Universal Analytics' `uip` was
removed and never replaced). So in reports, `offer_click` events will show our server's geo and an
unknown device. That is why `country` is sent as an explicit parameter from Cloudflare: **use the
"Country (Cloudflare)" custom dimension for these events, never GA's built-in Country.**

**Sessions and users are reconstructed, not native.** When the visitor's gtag ran, we reuse their
`_ga` client id and `_ga_<STREAM>` session id, so the click stitches onto their real session.
When gtag was blocked there are no cookies, and we fall back to a client id derived from a daily
hash of IP + User-Agent — stable enough that one blocked visitor is one user rather than one user
per click, and those events carry no `session_id` (GA opens a session of its own). `cookie_state`
tells you which population you are looking at.

## What is deliberately NOT counted

`trackServerEvent` drops the hit when the request is not a genuine human landing:

- **Prefetches.** Next prefetches `<Link>`s in production. Today it returns only the router tree
  for dynamic segments without rendering the page, but that is an implementation detail — a change
  there would otherwise start inflating clicks with hovers. Detected via `RSC` /
  `Next-Router-Prefetch` headers.
- **Bots**, by User-Agent.
- **Non-navigation requests** (`Sec-Fetch-Mode` other than `navigate`).

## Verifying a change

Set `GA_MP_DEBUG=1` to post to Google's validation endpoint instead of the live one — it records
nothing and returns what is wrong with the payload:

```bash
GA_API_SECRET=any-nonempty-value GA_MP_DEBUG=1 docker compose up -d frontend

curl -s -o /dev/null \
  -H 'Sec-Fetch-Mode: navigate' \
  -H 'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1' \
  -H 'CF-IPCountry: DE' -H 'CF-Connecting-IP: 203.0.113.7' \
  -b '_ga=GA1.1.1234567890.1700000000; _ga_TYBK5ZPHL9=GS2.1.s1755000000$o3$g1' \
  http://localhost:3002/offer/89/

docker logs pm-frontend-1 2>&1 | grep -A3 'ga:mp'
```

Want `"validationMessages": [ ]`. Anything else is a payload the live endpoint would have accepted
with a `204` and then quietly discarded — **the live endpoint validates nothing**, which is the
whole reason to use debug mode before shipping a parameter change.

The trap this caught during implementation: GA4 reserves the `ga_`, `google_` and `firebase_`
parameter prefixes and drops any parameter using them. A parameter originally named `ga_cookie`
was renamed to `cookie_state` for exactly this reason.

For live traffic, GA4 → **Reports** → **Realtime**, or **Admin** → **DebugView** (which needs
`debug_mode: true` added to the event params).

## Side effect: the offer route is now dynamic

Reading request headers opts `/offer/<id>/` out of Next's full route cache, so it renders per
request instead of being served from cache. That is required — a cached render would produce one
event for many visitors — and cheap here, since the Strapi lookup still hits the fetch cache
(`revalidate: 60`) and the page is a 3-second interstitial rather than a content page.

## Possible follow-up

This records clicks in GA only. If you want click data you fully own — queryable per site, per
offer, per country, with no sampling and no dependence on Google — the next step is a Strapi
collection written from this same code path. It is a bigger change (schema, write endpoint, an
auth story for it, and retention) and is not needed for the funnel numbers.
