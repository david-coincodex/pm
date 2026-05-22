import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  // English has no prefix (/), German uses /de/
  localePrefix: 'as-needed',
});
