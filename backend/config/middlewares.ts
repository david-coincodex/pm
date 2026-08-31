import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      headers: '*',
      origin: [
        'http://localhost:3002',
        'http://127.0.0.1:3002',
        process.env.FRONTEND_URL ?? '',
      ].filter(Boolean),
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  {
    name: 'strapi::body',
    // koa-body's default jsonLimit is 1mb; the cam feed sync POSTs a ~1MB roster of
    // ~3k models every 5 minutes and would intermittently 413 against the default.
    config: { jsonLimit: '8mb' },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
