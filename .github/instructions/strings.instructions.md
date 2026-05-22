---
applyTo: 'frontend/src/**'
---

## Translatable strings

All user-facing strings **must** be defined in the message JSON files and accessed via **next-intl**.

- English: `frontend/messages/en.json`
- German: `frontend/messages/de.json`
- Additional locales: add `frontend/messages/<locale>.json` and register the locale in `frontend/src/i18n/routing.ts`

### Rules

1. **Every new UI string goes into all message JSON files first**, then is referenced in the component.
2. **Dynamic strings** (containing variables) use ICU message syntax in the JSON:
   ```json
   { "copyright": "© {year} pm" }
   ```
   And consumed as: `t('copyright', { year: 2026 })`
3. **Group strings by feature/domain** using nested keys matching the namespace (e.g. `nav.*`, `sites.*`).
4. **Server components**: use `getTranslations('namespace')` from `next-intl/server` (async).
5. **Client components**: use `useTranslations('namespace')` from `next-intl` (requires `NextIntlClientProvider` in the tree — already set up in `[locale]/layout.tsx`).
6. Strings from the CMS (e.g. `site.name`, `site.short_description`) are exempt — they are translated at the content level.
7. `frontend/src/lib/strings.ts` is **deprecated** — do not import from it.
