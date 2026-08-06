/**
 * Minimal XML serializers for the hand-rolled sitemap routes.
 *
 * Hand-rolled because Next has no native sitemap-INDEX support: `app/sitemap.ts` can only emit a
 * single flat <urlset> (and `generateSitemaps` yields opaque /sitemap/[id].xml children with,
 * again, no index). The index + named-children layout lives in app/&#42;-sitemap.xml/route.ts.
 */

export type SitemapUrl = {
  loc: string;
  lastModified?: string | Date;
  /** hreflang -> absolute URL. Emitted as xhtml:link alternates when present. */
  alternates?: Record<string, string>;
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const lastmod = (d: string | Date) => (d instanceof Date ? d : new Date(d)).toISOString();

/** One <urlset> document. */
export function urlsetXml(urls: SitemapUrl[]): string {
  const body = urls
    .map((u) => {
      const parts = [`<loc>${esc(u.loc)}</loc>`];
      if (u.lastModified) parts.push(`<lastmod>${lastmod(u.lastModified)}</lastmod>`);
      for (const [lang, href] of Object.entries(u.alternates ?? {})) {
        parts.push(`<xhtml:link rel="alternate" hreflang="${esc(lang)}" href="${esc(href)}"/>`);
      }
      return `<url>${parts.join('')}</url>`;
    })
    .join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `${body}\n</urlset>\n`
  );
}

/** One <sitemapindex> document pointing at the child sitemaps. */
export function sitemapIndexXml(locs: string[]): string {
  const body = locs.map((l) => `<sitemap><loc>${esc(l)}</loc></sitemap>`).join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`
  );
}

export const XML_HEADERS = { 'Content-Type': 'application/xml; charset=utf-8' } as const;
