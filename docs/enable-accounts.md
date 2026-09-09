# User accounts — sign-up, sign-in, passwords, favorites

**Status: ON.** (Parked behind the flag for the cams-first launch on 2026-08-29; the flow was
finished and switched back on in #89.) Everything runs on **stock Strapi
users-permissions** — registration, login, JWTs, forgot/reset, email confirmation and Google
sign-in are the plugin's own endpoints. Our own backend code is four thin endpoints and
nothing else.

## The switch

`frontend/src/lib/siteSettings.ts` → `features.accounts`. One line still hides the whole
feature: account pages `notFound()`, every `/api/auth/*` and `/api/favorites` handler 404s,
the header's account button and all hearts disappear, and `FavoritesProvider` stops probing
the session.

| Surface | Where the guard lives |
|---|---|
| `/account/*` pages (confirm, forgot-password, reset-password, settings, favorites) | `notFound()` at the top of each page — `src/app/[locale]/(chrome)/account/` |
| The sign-in popup itself | `AuthModalProvider` renders nothing and `useAuthModal().open()` becomes a no-op |
| Auth BFF (`/api/auth/*`, thirteen handlers) | `accountsDisabled()` as the first statement — `src/lib/authApi.ts` |
| Favorites BFF (`/api/favorites` GET/POST/DELETE) | inline flag check per handler |
| Session probe (`/api/auth/me` once per page load) | `FavoritesProvider` stays inert — `src/hooks/useFavorites.tsx` |
| Header account icon (desktop + drawer row) | `NavMenu.tsx`, gated on `features.accounts` ALONE |
| Hearts on cards + favorites strip/pill | `CamFavoriteButton`, `CamFavoritesStrip`, `CamListControls` — these are COMPOUND guards (`features.liveSex && features.accounts`) |

**Neither the desktop bar nor the mobile drawer has a favorites entry.** The account control
leads to the favorites page once signed in, so a second link to the same destination was only
clutter. Favoriting itself is unchanged: the heart still marks individual models on cards and
model pages, and `/account/favorites/` is reachable from the account button and from the
listing's favorites pill.

## The popup is the only door

There are no `/account/login` or `/account/register` pages — sign-in and sign-up happen in one
popup (`AuthModalProvider` → `AuthModal` → `AuthForm`), built on the house `PopoverSheet`
component, so it is a bottom sheet on phones and a centred card on desktop, exactly like the
language switcher and the payment-methods list.

Two things open it:

- `useAuthModal().open('login' | 'register')` from any client component — the header's account
  button, the heart on a cam card, the favorites hint on a listing. The heart matters most:
  opening in place keeps someone mid-browse on the grid they were browsing.
- **`?auth=login` / `?auth=register` on any URL**, which is how SERVER code reaches it —
  `/account/settings` and `/account/favorites` redirect signed-out visitors that way, and the
  Google callback route appends `&error=…`. `routes.login()` / `routes.register()` return those
  URLs, so every link and redirect goes through one definition. The parameters are wiped from
  the address bar once read, so a refresh does not reopen the popup and `?error=` never reaches
  analytics.

Consequence worth knowing: **signing in now requires JavaScript.** The deleted pages were the
no-JS path. Everything after sign-in (the emailed confirmation and reset links, the account
page) is still a normal page.

## The flows

**Sign-up is three steps**, so the visitor types an address before anything else:

1. **Email only** — the popup posts to `/api/auth/register`, which
   normalizes the address, checks the captcha and the email policy, then calls stock
   `POST /api/auth/local/register` with a **random password the visitor never learns**.
2. **The link in the email** lands on `/account/confirm/?confirmation=…` — a real page, because
   the click can happen in another browser or days later. It redeems the token through
   `GET /api/account/confirm-email`, which is the stock controller called with its
   `returnUser` flag so confirming **returns a session** instead of a bare redirect.
3. **Choose a password** on that same page, via `POST /api/account/set-password`.

**Google** ends at the same stock endpoint either way, and the site never reimplements provider
login:

1. **Popup (what visitors get).** Google Identity Services' token client opens Google's own
   account picker over the page. The browser receives an OAuth access token, posts it to
   `/api/auth/google/token`, and the BFF exchanges it server-side at stock
   `GET /api/auth/google/callback?access_token=…`. No navigation, and the CMS is never touched
   by the browser — so the Cloudflare Access bypass matters only for the fallback below.
2. **Redirect (fallback).** The classic chain — `<CMS>/api/connect/google` → Google →
   `<CMS>/api/connect/google/callback` → our `/api/auth/google/callback`. Used automatically
   when Google's script cannot load (content blockers), so the button is never dead.

Google's script is fetched on CLICK, not on page load, so it costs nothing to visitors who
never use it. Google's **One Tap** prompt is deliberately not used: it returns a signed ID
token, which stock users-permissions cannot verify — supporting it would mean reimplementing
provider login against Google's JWKS.

### Turning Google on

Two ways, and **the admin panel is not overridden**:

| How | When to use | Behaviour |
|---|---|---|
| **Settings → Users & Permissions plugin → Providers → Google** in Strapi | ad-hoc, or any environment where you would rather not redeploy | Survives restarts. The bootstrap only fills in an empty `callback` for you. |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` on the backend | staging/production, so a fresh database is reproducible | Seeded into the plugin store on every boot; the environment wins while it is set. |

Either way **the site follows the CMS**: `GET /api/account/auth-providers` reports whether the
provider is enabled and hands the frontend the (public) client id, and the popup asks for that
the first time it opens. There is no frontend flag to keep in step — enabling Google in the
admin panel makes the button appear within a minute, with no rebuild and no restart. (An
earlier `NEXT_PUBLIC_GOOGLE_SIGNIN` build arg did exactly the opposite: the panel could enable
the provider while the button stayed hidden until someone rebuilt the image.)

**Signup never says whether an address is taken.** Reporting "email already taken" to whoever
typed it makes registration an account-existence oracle, and on this site that fact is itself
sensitive information about a person. So every address gets the same 200 and the same "we sent
you an email" screen, and the difference moves into the mailbox where only its owner sees it —
`POST /api/account/notify-signup-attempt` re-sends the confirmation link if the account was
never confirmed, or mails a "someone tried to sign up with your email, nothing has changed"
notice if it was (one per address per hour, an in-memory best-effort guard against using it to
mailbomb someone). Deliberately not a password-reset mail: that would drop a live reset token
into the inbox of someone who never asked for one. Residual: the response still differs for a
taken address when NO mailer is configured, since the fresh-signup path returns a session
inline — enumeration protection needs the same working relay that confirmation does.

**Reset** is stock forgot/reset; the email's link target is seeded to
`/account/reset-password`. **Change password** (needs the current one) lives on
`/account/settings/`, which also offers *set* password for accounts that never had one.

Everything session-related goes through the BFF: the Strapi JWT lives in the `pm_jwt`
httpOnly cookie (30 d) and never reaches browser JS.

### `passwordSet` — the one field we added

`backend/src/extensions/users-permissions/content-types/user/schema.json` adds a boolean
`passwordSet`. It records whether the holder ever chose their own password, and it is what
authorizes `set-password` (allowed only when `passwordSet` is false or the provider isn't
`local`). Everyone else must use change-password, which demands the current password — so a
stolen session cannot silently take over an account.

⚠️ That file must contain the **complete** stock user schema, because an extension schema
*replaces* the plugin's rather than merging into it. See the README beside it — getting this
wrong once migrated `up_users` down to two columns.

## Anti-spam

- **One account per real mailbox.** `normalizeEmail` (`src/lib/accountPolicy.ts`) lowercases,
  strips `+tags` on every domain, and collapses gmail dots / `googlemail.com`. The normalized
  form is what gets stored, so `you+x@gmail.com` and `y.ou@gmail.com` are one account.
- **Disposable domains** are rejected (`mailchecker`, ~56k domains) and **typo domains** are
  caught by an MX/A lookup — which fails **open** on any DNS trouble, because a flaky resolver
  must never block real signups (`src/lib/emailPolicy.ts`).
- **Cloudflare Turnstile** on register, forgot-password and resend-confirmation (not on login,
  which is per-IP rate-limited instead). Both keys unset ⇒ skipped; one key alone ⇒ the routes
  refuse to serve, rather than silently running without a captcha.
- The CMS itself sits behind Cloudflare Access in staging/production, so **the BFF is the only
  public door** and these checks cannot be bypassed.

## Email

**Mailgun's HTTP API** is the sender in staging and production, via the official
`@strapi/provider-email-mailgun` (pinned to our Strapi version so both share one
`@strapi/utils`). The API rather than SMTP because the API key *is* the credential — Mailgun
SMTP would need separate per-domain credentials.

`config/plugins.ts` knows exactly one mail path, so what an environment can send is never
ambiguous:

| Config | Provider | Email confirmation |
|---|---|---|
| `MAILGUN_API_KEY` set | Mailgun HTTP API | required |
| unset | none registered | off — registration signs the visitor straight in |

There is deliberately **no SMTP configuration** — swapping senders means swapping the provider
package, not flipping env vars to a relay nobody has vetted.

- **Sending domain** `pornmode.com` (`MAILGUN_DOMAIN`), state *active*, SPF + DKIM
  (`mx._domainkey`) valid — the ROOT domain, not an `mg.` subdomain.
- **From** `noreply@pornmode.com`, i.e. the same domain Mailgun signs, so DKIM aligns
  **strictly** with the From header and `_dmarc.pornmode.com` (`p=none`) governs it.
- **Region matters**: `MAILGUN_URL` defaults to `https://api.mailgun.net`; an EU account must
  use `https://api.eu.mailgun.net` or every send 401s.
- **Local dev sends REAL mail too** — the key sits in `backend/.env` (git-ignored), so a local
  signup exercises the exact production path, DKIM and all. Delete that line to work offline
  (mail then simply turns off and registration degrades to immediate sign-in). Test with
  addresses you own: every send is a real email from `noreply@pornmode.com`, and bounces from
  made-up addresses count against the domain's reputation.
- ⚠️ `pornmode.com`'s SPF is `v=spf1 include:mailgun.org ~all` — **Mailgun only**, while the
  domain also has Google Workspace MX records. Staff mail sent from Workspace therefore fails
  SPF; harmless today (softfail + `p=none` blocks nothing) but it must be fixed before DMARC is
  ever tightened: `v=spf1 include:_spf.google.com include:mailgun.org ~all`.

Why Mailgun at all: SendGrid, Postmark, Brevo, SocketLabs and SMTP.com all prohibit adult
businesses in their AUPs. Mailgun's own policy is the permissive one of the mainstream set —
worth re-reading before scaling up, and worth keeping the SMTP fallback for.

**From vs Reply-To**: mail goes out as `noreply@pornmode.com` but carries
`Reply-To: info@pornmode.com` (`SUPPORT_EMAIL`, a Google Workspace mailbox), because people do
reply to account email — "I didn't sign up for this" — and a reply to the From address would
land nowhere. It is one knob: the same value the signup-attempt notice tells people to write to.

Mail also SPLITS by sender on one domain: Mailgun sends the transactional mail (DKIM
`mx._domainkey`), Google Workspace sends and receives everything human (its own
`google._domainkey`, and the MX records are Google's alone). One SPF record covers both
(`include:_spf.google.com include:mailgun.org`) and one root DMARC policy governs the lot.

### Templates live at Mailgun

The styled markup (dark header with the wordmark, bulletproof CTA, legal footer) is defined
once in `scripts/lib/email-templates.mjs` and deployed with:

```bash
node scripts/deploy-mailgun-templates.mjs --dry-run   # sizes + subjects
node scripts/deploy-mailgun-templates.mjs             # create, or add an active version
```

Three templates: `pm-confirm`, `pm-reset`, `pm-signup-notice`. Copy fixes are an API call, not a
deploy, and Mailgun keeps every previous version for rollback.

**How stock flows reach them.** The confirmation and reset emails are sent by stock
users-permissions, which renders its own HTML and offers no "use template X" hook. So the
seeded store templates carry a marker — `<!--pm-tpl:pm-confirm|confirm_url=…-->` — and a wrapper
installed on `strapi.plugin('email').provider.send` (bootstrap, `src/index.ts`) turns it into
Mailgun's `template` + `h:X-Mailgun-Variables`. Emails we send ourselves (the signup-attempt
notice) pass `template` directly and need no marker.

Two traps, both paid for already: the hook must be on the PROVIDER, because
`sendTemplatedEmail` bypasses the service method and the container resolves the service before
`src/extensions/email` can decorate its factory. And every store template keeps a full HTML
body after the marker, so a broken mapping still sends a working email rather than nothing.

Emails are table-based, 600px, inline-styled, with a preheader and no remote images — the
wordmark is live text, because most clients block images from an unknown sender and a
first-contact email whose branding is a grey box is worse than one with none.

### Consent

The confirmation email states the terms and the marketing permission, with links to
`/terms/` and `/privacy/` — that click is the consent record, which is why it is also the
moment the address joins the marketing list.

### Marketing list

`newsletter@pornmode.com` (Mailgun mailing list, `MAILGUN_LIST_ADDRESS`). Membership is driven
by ONE database lifecycle subscription in `src/index.ts`, not by calls sprinkled through the
flows, so every path is covered:

| event | action |
|---|---|
| account becomes `confirmed` (email link) | subscribe |
| account created already confirmed (Google) | subscribe |
| account deleted | unsubscribe — keeping a closed account on a marketing list is a GDPR problem |

Never at registration: an unconfirmed row is an unproven address, so mailing it would be both
consent-less and a bounce risk against the sending domain. Failures are logged and swallowed —
a marketing write must never break an account flow.

The link targets, the branded templates, the `email_confirmation` setting and the Google
provider credentials are all **seeded into the plugin store at every boot** from environment
variables (`backend/src/index.ts`) — a fresh database in any environment comes up correctly
configured instead of depending on clicks in the admin panel. Changes are logged.

## Manual setup outside the repo

1. **Google Cloud console** — OAuth consent screen + a web client needing BOTH lists filled in:
   - **Authorized JavaScript origins** (the popup flow): `http://localhost:3002`,
     `https://staging.pornmode.com`, `https://pornmode.com`.
   - **Authorized redirect URIs** (the redirect fallback):
     `http://localhost:1339/api/connect/google/callback`,
     `https://cms-staging.pornmode.com/api/connect/google/callback`,
     `https://cms.pornmode.com/api/connect/google/callback`.

   Then either paste the client id/secret into Strapi's Providers screen or set the two env
   vars — see "Turning Google on" above.
2. **Cloudflare Access** — a bypass policy for path `/api/connect/*` on `cms.pornmode.com` and
   `cms-staging.pornmode.com`. Only the redirect FALLBACK needs it (the popup flow never sends
   the browser to the CMS), but without it that fallback lands on a login page.
3. **Cloudflare Turnstile** — one widget covering `pornmode.com`, `staging.pornmode.com` and
   `localhost`.
4. **Mailgun** — already set up: domain `pornmode.com` active, SPF/DKIM valid,
   `_dmarc.pornmode.com` published at `p=none`, key stored in the `staging` and `production`
   GitHub environments. Outstanding: add Google Workspace to the root SPF (see above).
5. Set the secrets/variables per environment — see the account rows in `ENVIRONMENT.md`.
   `TURNSTILE_SITE_KEY` and `GOOGLE_SIGNIN` are **build args**, so they need a rebuild, not a
   restart.

## Verification after any change here

- The popup opens from the header icon, from a heart while signed out, and from
  `/?auth=register`; its heading follows the login/sign-up switch; `/account/login/` and
  `/account/register/` are gone (404). `/api/auth/me` answers `{user:null}` logged out.
- Local end-to-end (real Mailgun mail, use an address you own): register → confirm link →
  set password → sign out → sign in;
  login before confirming → "not confirmed" + working re-send; forgot → reset → signed in.
- Negative: replaying a confirmation link 400s; `set-password` on an account that already has
  one 400s (change-password still works); a disposable domain and a typo domain are rejected.
- Enumeration: registering a brand-new address, an existing unconfirmed one and an existing
  confirmed one must return byte-identical responses — only the emails differ.
- The cams money pages must STAY static: hearts, the favorites strip and the account button
  are client islands precisely so listings never read cookies server-side.
