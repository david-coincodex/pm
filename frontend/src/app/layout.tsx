import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "flag-icons/css/flag-icons.min.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 dark:bg-slate-900`}>
        {children}
      </body>
    </html>
  );
}

