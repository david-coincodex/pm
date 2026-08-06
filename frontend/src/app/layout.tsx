import "./globals.css";
import ScrollToTopOnNavigate from "@/components/ScrollToTopOnNavigate";
import Analytics from "@/components/Analytics";
import { routing } from "@/i18n/routing";

// Root layout: provides <html> and <body> required by Next.js 16.
// lang is static: the site ships English-only for launch (routing.locales = ['en']).
// When more locales return, this must become per-request — see docs/enable-multilanguage.md.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={routing.defaultLocale}>
      <head>
        {process.env.NODE_ENV === "development" && (
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script src="https://unpkg.com/react-grab/dist/index.global.js" crossOrigin="anonymous" />
        )}
      </head>
      <body className="antialiased bg-slate-50 dark:bg-slate-900">
        <Analytics />
        <ScrollToTopOnNavigate />
        {children}
      </body>
    </html>
  );
}

