import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'color-picker': { enabled: true },

  // End-user accounts (live-cam favorites). Register/login run through the frontend's BFF
  // route handlers; the JWT never reaches browser JS. Email confirmation stays OFF until an
  // email provider is configured (no SMTP yet — the transitive sendmail provider fails in
  // Docker, so enabling confirmation would brick registration).
  'users-permissions': {
    config: {
      jwtSecret: env('JWT_SECRET'),
      jwt: { expiresIn: '30d' },
      // Whitelist of extra registration fields: empty = username/email/password only,
      // blocking mass-assignment of arbitrary user columns through /auth/local/register.
      register: { allowedFields: [] },
    },
  },

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
});

export default config;
