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
    /** Live cam aggregator (/live-sex): flips the routes, the nav target, and its sitemap. */
    liveSex: true,
    /** User accounts + favorites, hidden for the cams-first launch: account pages and the
     * auth/favorites BFF routes 404, hearts and the favorites views disappear. Nothing was
     * deleted — see docs/enable-accounts.md to switch back on. */
    accounts: false,
  },
} as const;
