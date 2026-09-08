import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => {
  /**
   * Transactional email (account confirmation, password reset, the signup-attempt notice):
   * MAILGUN'S HTTP API, and nothing else — no SMTP path, by decision. The official provider is
   * pinned to our Strapi version so both share one @strapi/utils, and the API key is the whole
   * credential (Mailgun SMTP would need separate per-domain credentials).
   *
   * No key ⇒ NO provider is registered, and the bootstrap keeps email confirmation off, so a
   * fresh checkout without backend/.env still boots and registration degrades to immediate
   * sign-in instead of creating accounts nobody can confirm (see src/index.ts). Every real
   * environment has the key: backend/.env in dev, GitHub environment secrets in staging/prod.
   */
  const mailgunKey = env('MAILGUN_API_KEY');
  const emailConfig = mailgunKey
    ? {
        provider: 'mailgun',
        providerOptions: {
          key: mailgunKey,
          domain: env('MAILGUN_DOMAIN', 'pornmode.com'),
          // Region matters: EU accounts must point at api.eu.mailgun.net or every send 401s.
          url: env('MAILGUN_URL', 'https://api.mailgun.net'),
        },
        settings: {
          defaultFrom: env('EMAIL_FROM', 'noreply@pornmode.com'),
          /**
           * Reply-To is the SUPPORT address, not the From: these emails come from a no-reply
           * mailbox, and people do reply to account email ("I didn't sign up for this").
           * ONE knob — SUPPORT_EMAIL is the same value the signup-attempt notice tells people
           * to write to, so the two cannot drift.
           */
          defaultReplyTo: env('EMAIL_REPLY_TO', env('SUPPORT_EMAIL', 'info@pornmode.com')),
        },
      }
    : null;

  return {
  'color-picker': { enabled: true },

  // End-user accounts. Register/login/reset/confirmation and Google sign-in all run through
  // STOCK users-permissions; the frontend's BFF route handlers are the only public door, so
  // the JWT never reaches browser JS (it lives in the httpOnly pm_jwt cookie).
  //
  // Email confirmation is NOT set here: src/index.ts seeds it into the plugin store from the
  // environment on every boot (on iff a mail provider is configured — see emailConfig above),
  // together with the reset/confirm link targets. Google's credentials are seeded the same way
  // when they are in the environment, and otherwise left to Strapi's admin panel.
  'users-permissions': {
    config: {
      jwtSecret: env('JWT_SECRET'),
      jwt: { expiresIn: '30d' },
      // Whitelist of extra registration fields: empty = username/email/password only,
      // blocking mass-assignment of arbitrary user columns through /auth/local/register.
      // NOTE: this is why `passwordSet` (see the user content-type extension) can never be
      // forged by a registration payload — it is server-controlled only.
      register: { allowedFields: [] },
    },
  },

  ...(emailConfig ? { email: { config: emailConfig } } : {}),

  upload: {
    config: {
      providerOptions: {
        // Strapi's local provider serves /uploads/* via koa-static and already answers HTTP
        // Range requests (verified: 206 + Content-Range), which is what makes seeking work
        // for self-hosted video. Its default `maxage` is 0 though, so every seek re-fetched
        // from origin. Upload filenames are content-hashed, so caching them ~forever is safe.
        //
        // NOTE: koa-static's `maxage` is in MILLISECONDS (1 year here), unlike the seconds
        // used by the Cache-Control header it produces.
        localServer: { maxage: 31_536_000_000 },
      },
    },
  },
  };
};

export default config;
