import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { resolveRedirect } from './lib/redirects';

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  // Server-side 301 redirects (with wildcard support) take precedence over locale routing.
  const destination = resolveRedirect(
    request.nextUrl.pathname,
    routing.locales,
    routing.defaultLocale,
  );
  if (destination) {
    if (/^https?:\/\//i.test(destination)) {
      return NextResponse.redirect(destination, 301);
    }
    const url = request.nextUrl.clone();
    url.pathname = destination; // query string is preserved by clone()
    return NextResponse.redirect(url, 301);
  }

  return intlMiddleware(request);
}

export const config = {
  // Match all paths except API routes, Next.js internals, and static files
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
