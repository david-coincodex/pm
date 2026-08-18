import "./globals.css";
import ScrollToTopOnNavigate from "@/components/ScrollToTopOnNavigate";
import Analytics from "@/components/Analytics";
import { routing } from "@/i18n/routing";
import { THEME_SCRIPT } from "@/lib/theme";

// Root layout: provides <html> and <body> required by Next.js 16.
// lang is static: the site ships English-only for launch (routing.locales = ['en']).
// When more locales return, this must become per-request — see docs/enable-multilanguage.md.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the theme script below stamps data-theme on <html> before
    // hydration, which the server-rendered markup can't know about.
    <html lang={routing.defaultLocale} suppressHydrationWarning>
      <head>
        {/* Resolve the theme BEFORE first paint (stored choice, else system preference) —
            a blocking inline script so there is never a flash of wrong theme. It also owns
            live OS-theme following and cross-tab sync; see lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {process.env.NODE_ENV === "development" && (
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script src="https://unpkg.com/react-grab/dist/index.global.js" crossOrigin="anonymous" />
        )}
      </head>
      {/* No background utilities here on purpose: the unlayered `body` rule in globals.css
          always wins over layered utilities, so the --background token is the single source
          of truth for the page background. */}
      <body className="antialiased">
        <Analytics />
        <ScrollToTopOnNavigate />
        {children}
      </body>
    </html>
  );
}

