# Why this schema.json repeats the whole user model

`content-types/<name>/schema.json` under `src/extensions/<plugin>/` **replaces** the plugin's
schema — it is not merged into it. A file containing only the added attribute therefore drops
every stock column: doing exactly that once migrated `up_users` down to `id` + `password_set`,
which destroyed the dev database's user rows (`no such column: t0.email` on registration).

So this file is the stock users-permissions user schema
(`node_modules/@strapi/plugin-users-permissions/server/content-types/user/index.js`) copied
verbatim, plus our own `passwordSet`. When upgrading Strapi, diff that file against this one.

`passwordSet` records whether the account holder ever chose their own password (registration
assigns a random one they never see; Google sign-in sets none), which is what authorizes
`POST /api/account/set-password` — see `src/api/account/controllers/account.ts`. It is
deliberately NOT `private`, because `/api/users/me` has to tell the settings page whether to
offer "set password" or "change password".
