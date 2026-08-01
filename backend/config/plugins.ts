import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'color-picker': { enabled: true },

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
