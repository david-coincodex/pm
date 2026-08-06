/** Global site settings / constants. */
export const siteSettings = {
  baseUrl: 'https://pornmode.com',
  supportEmail: 'info@pornmode.com',
  siteName: 'PornMode',
  /** Strapi category ID for cam sites — used for fetching and cam-specific UI */
  CAM_CATEGORY_ID: 3,
  /**
   * Launch feature flags. Each guards EVERY surface of its feature (routes, nav, sections,
   * sitemap), so flipping one back on is a one-line change — see docs/enable-bundles.md.
   * (Multilanguage is toggled in src/i18n/routing.ts instead: the locales array is the switch —
   * see docs/enable-multilanguage.md.)
   */
  features: {
    /** Bundles are hidden for launch: pages 404, links/sections/sitemap entries disappear. */
    bundles: false,
  },
} as const;
