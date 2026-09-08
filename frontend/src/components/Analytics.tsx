import Script from 'next/script';
import { GA_MEASUREMENT_ID } from '@/lib/analytics';

/**
 * Google Analytics 4 loader.
 *
 * Uses `next/script` rather than adding `@next/third-parties` — one dependency for two script tags
 * is not worth it, and `afterInteractive` already gives the same "don't block first paint" behaviour.
 *
 * Deliberately production-only: local dev and preview builds would otherwise pour developer traffic
 * into the same property, which quietly corrupts every report. To verify the tags for real, run a
 * production build locally (`npm run build && npx next start`), or set NEXT_PUBLIC_GA_ID to a test
 * property. An empty NEXT_PUBLIC_GA_ID disables it outright.
 */
export default function Analytics() {
  if (process.env.NODE_ENV !== 'production' || !GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      {/*
        `page_location` is overridden on /account/ pages to drop the query string, because the
        confirmation and password-reset links carry SINGLE-USE TOKENS there
        (?confirmation=…, ?code=…). GA's automatic page_view would otherwise ship a live reset
        token — enough to take over the account — to a third party, and store it in reports
        anybody with property access can read. Everywhere else the full href is kept, so utm_*
        campaign attribution is untouched.

        Locale prefix is optional in the pattern: /account/… today, /de/account/… once more
        locales come back.
      */}
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
var pmLoc = /^\\/([a-z]{2}\\/)?account\\//.test(location.pathname)
  ? location.origin + location.pathname
  : location.href;
gtag('config', '${GA_MEASUREMENT_ID}', { page_location: pmLoc });`}
      </Script>
    </>
  );
}
