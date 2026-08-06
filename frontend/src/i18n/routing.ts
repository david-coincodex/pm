import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // Launching English-only: this array IS the multilanguage switch. Everything downstream
  // (locale routing, hreflang alternates, the language switcher, locale-expanded redirects)
  // derives from it — restore ['en', 'de'] to re-enable. See docs/enable-multilanguage.md.
  locales: ['en'],
  defaultLocale: 'en',
  // English has no prefix (/); other locales get a /<locale>/ prefix
  localePrefix: 'as-needed',
});
