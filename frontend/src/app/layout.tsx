import "./globals.css";
import ScrollToTopOnNavigate from "@/components/ScrollToTopOnNavigate";

// Root layout: provides <html> and <body> required by Next.js 16.
// suppressHydrationWarning allows the [locale] subtree to set lang.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
      <head>
        {process.env.NODE_ENV === "development" && (
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script src="https://unpkg.com/react-grab/dist/index.global.js" crossOrigin="anonymous" />
        )}
      </head>
      <body className="antialiased bg-slate-50 dark:bg-slate-900">
        <ScrollToTopOnNavigate />
        {children}
      </body>
    </html>
  );
}

