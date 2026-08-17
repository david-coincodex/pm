import parse, { type DOMNode, Element } from 'html-react-parser';
import { isValidElement, type ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import ProsConsBlock from '@/components/rich-text/ProsConsBlock';
import SiteCardInline from '@/components/rich-text/SiteCardInline';
import SiteCardInlineList from '@/components/rich-text/SiteCardInlineList';
import ArticleCard from '@/components/ArticleCard';
import CommercialIndex from '@/components/rich-text/CommercialIndex';
import CommercialBlock from '@/components/rich-text/CommercialBlock';
import ImageGallery from '@/components/ImageGallery';
import { prefetchWidgetData, extractCommercialIds, type WidgetData } from '@/lib/richTextWidgets';
import { resolveMediaSrc, type Site, type Article, type Commercial } from '@/lib/strapi';

/**
 * Attributes per element that hold a media URL and therefore need the media host prefixed.
 *
 * `<a href>` is included because the CKEditor media library also inserts plain links for
 * non-image uploads (PDFs and the like) — `prefixFileUrlWithBackendUrl` treats those the same
 * as an image `src`, so they arrive in the same shape.
 */
const MEDIA_ATTRS: Record<string, readonly string[]> = {
  img: ['src', 'srcset'],
  source: ['src', 'srcset'],
  video: ['src', 'poster'],
  a: ['href'],
};

const ELEMENT_CLASSES: Record<string, string> = {
  p: 'text-base leading-relaxed text-slate-700 dark:text-slate-300',
  h1: 'text-2xl font-bold text-slate-900 dark:text-white mt-6 mb-3',
  h2: 'text-xl font-bold text-slate-900 dark:text-white mt-5 mb-2',
  h3: 'text-lg font-semibold text-slate-900 dark:text-white mt-4 mb-2',
  h4: 'text-base font-semibold text-slate-900 dark:text-white mt-3 mb-1',
  h5: 'text-sm font-semibold text-slate-900 dark:text-white mt-3 mb-1',
  h6: 'text-sm font-medium text-slate-900 dark:text-white mt-2 mb-1',
  // list-outside + pl: markers sit in the padding, so wrapped lines align with the text
  // instead of tucking under the bullet, and the whole list is indented from the prose.
  ul: 'list-disc list-outside pl-6 space-y-1 text-slate-700 dark:text-slate-300',
  ol: 'list-decimal list-outside pl-6 space-y-1 text-slate-700 dark:text-slate-300',
  li: 'text-slate-700 dark:text-slate-300',
  a: 'text-emerald-600 hover:underline dark:text-emerald-400',
  blockquote: 'border-l-4 border-emerald-400 pl-4 italic text-slate-600 dark:border-emerald-600 dark:text-slate-400',
  code: 'rounded bg-slate-100 px-1 py-0.5 font-mono text-sm dark:bg-slate-800',
  pre: 'overflow-x-auto rounded-lg bg-slate-100 p-4 font-mono text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  img: 'rounded-lg max-w-full h-auto',
  // Imported legacy Gutenberg bodies use these. Without an entry they fall through to the UA
  // stylesheet, which gives <figure> a 40px margin on both sides — every image visibly inset.
  figure: 'my-5',
  figcaption: 'mt-2 text-center text-sm text-slate-500 dark:text-slate-400',
  video: 'rounded-lg max-w-full h-auto',
  table: 'w-full border-collapse text-sm text-slate-700 dark:text-slate-300',
  th: 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-left font-semibold',
  td: 'border border-slate-200 dark:border-slate-700 px-3 py-2',
};

// Rich-text CTA button: the CKEditor "Button Style" decorator marks the <a> with `data-button`;
// we map it to Tailwind utilities at render — no bespoke CSS and no descendant selector that
// could leak into nested components. (Literal here so Tailwind generates these utilities.)
const RT_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-4 text-lg font-bold text-white no-underline transition hover:bg-emerald-700 active:scale-95 dark:bg-emerald-500 dark:hover:bg-emerald-600';

/** Ordered commercial context, derived from document order (see extractCommercialIds). */
type CommercialContext = {
  ordered: Commercial[];
  ordinals: Map<string, number>;
  canonicalPath?: string;
};

function replaceNode(
  domNode: DOMNode,
  prosLabel: string,
  consLabel: string,
  widgetData: WidgetData,
  locale: string,
  commercials: CommercialContext,
) {
  if (!(domNode instanceof Element)) return;

  // Widget: Pros/Cons
  if (domNode.attribs['data-component'] === 'pros-cons') {
    const pros = domNode.attribs['data-pros']?.split('||').filter(Boolean) ?? [];
    const cons = domNode.attribs['data-cons']?.split('||').filter(Boolean) ?? [];
    return <ProsConsBlock pros={pros} cons={cons} prosLabel={prosLabel} consLabel={consLabel} />;
  }

  // Widget: Site Card
  if (domNode.attribs['data-component'] === 'site-card') {
    const id = domNode.attribs['data-site-id'];
    const site = widgetData.get(`site-card:${id}`) as Site | undefined;
    if (!site) return <></>;
    return <SiteCardInline site={site} />;
  }

  // Widget: Article Card
  if (domNode.attribs['data-component'] === 'article-card') {
    const id = domNode.attribs['data-article-id'];
    const article = widgetData.get(`article-card:${id}`) as Article | undefined;
    if (!article) return <></>;
    return <ArticleCard variant="compact" article={article} locale={locale} className="not-prose my-4" />;
  }

  // Widget: Commercial ("ad") — one full entry. Renders its own <h2 id> so the anchor, the
  // index href and the JSON-LD @id all derive from the same slug.
  if (domNode.attribs['data-component'] === 'commercial') {
    const id = domNode.attribs['data-commercial-id'];
    const commercial = widgetData.get(`commercial:${id}`) as Commercial | undefined;
    if (!commercial) return <></>;
    return (
      <CommercialBlock
        commercial={commercial}
        ordinal={commercials.ordinals.get(id) ?? 0}
        canonicalPath={commercials.canonicalPath}
      />
    );
  }

  // Widget: Commercial index — carries no ids; derived from the commercial widgets below it.
  if (domNode.attribs['data-component'] === 'commercial-index') {
    if (!commercials.ordered.length) return <></>;
    return <CommercialIndex commercials={commercials.ordered} canonicalPath={commercials.canonicalPath} />;
  }

  // Widget: Media gallery — the article's own media (top-of-page images + promo clips),
  // rendered in the same grid used for site galleries. Items are self-contained JSON in the
  // attribute (url/mime/alt), NOT ids: uploads are files, not documents, so there is nothing
  // stable to reference — and the widget must keep working if the upload library is reorganised.
  if (domNode.attribs['data-component'] === 'media-gallery') {
    let items: Array<{ url: string; mime?: string; alt?: string }> = [];
    try {
      const parsedItems = JSON.parse(domNode.attribs['data-items'] ?? '[]');
      if (Array.isArray(parsedItems)) items = parsedItems.filter((it) => it && typeof it.url === 'string');
    } catch {
      // Malformed JSON: render nothing rather than crash the whole article.
    }
    if (!items.length) return <></>;
    return (
      <ImageGallery
        images={items.map((it, i) => ({ id: i, url: it.url, alternativeText: it.alt ?? null, mime: it.mime }))}
        className="not-prose my-6"
      />
    );
  }

  // Widget: Site Card List
  if (domNode.attribs['data-component'] === 'site-card-list') {
    const idsStr = domNode.attribs['data-site-ids'] ?? '';
    const showAttr = domNode.attribs['data-show'];
    const initialShow = showAttr ? parseInt(showAttr, 10) : 5;
    const sites = (widgetData.get(`site-card-list:${idsStr}`) as Site[] | undefined) ?? [];
    if (!sites.length) return <></>;
    return <SiteCardInlineList sites={sites} initialShow={initialShow} />;
  }

  // Button-style links: content marks the <a> with `data-button` (CKEditor "Button Style"
  // decorator); map it to Tailwind utilities here.
  const isButtonLink = domNode.name === 'a' && domNode.attribs['data-button'] != null;
  if (isButtonLink) {
    delete domNode.attribs['data-button'];
    domNode.attribs.class = RT_BUTTON_CLASSES;
  } else {
    // Standard element styling
    const classes = ELEMENT_CLASSES[domNode.name];
    if (classes) {
      const existing = domNode.attribs.class ?? '';
      domNode.attribs.class = existing ? `${existing} ${classes}` : classes;
    }
  }

  // Add rel to links
  if (domNode.name === 'a' && !domNode.attribs.rel) {
    domNode.attribs.rel = 'noopener noreferrer';
  }

  // Prefix stored media paths with the media host.
  //
  // Content deliberately stores root-relative `/uploads/...` so no host is baked into the
  // database — which means the domain has to be added HERE, at render, or the browser resolves
  // it against the site origin and every inline image 404s (494 refs across 69 articles did).
  // `resolveMediaSrc` is a no-op on anything already absolute, so this is safe to run over
  // legacy content and idempotent if the same node is visited twice.
  if (MEDIA_ATTRS[domNode.name]) {
    for (const attr of MEDIA_ATTRS[domNode.name]) {
      const value = domNode.attribs[attr];
      if (!value) continue;
      // `srcset` is a comma-separated candidate list ("url 800w, url2 1600w"), and the browser
      // PREFERS it over `src` — so missing it would leave the fixed `src` unused. Only rewritten
      // when it actually references our uploads: splitting on "," would corrupt a data-URI
      // srcset (the comma inside `data:image/png;base64,…` is payload, not a separator), and
      // CKEditor's config permits image data-URIs.
      domNode.attribs[attr] = attr === 'srcset'
        ? (value.includes('/uploads/')
            ? value.split(',').map((c) => {
                const [url, ...rest] = c.trim().split(/\s+/);
                return url ? [resolveMediaSrc(url), ...rest].join(' ') : c.trim();
              }).join(', ')
            : value)
        : resolveMediaSrc(value);
    }
  }
}

interface RichTextProps {
  content: unknown;
  className?: string;
  /** Optional node spliced in immediately before the last top-level <h2> (appended if none). */
  injectBeforeLastH2?: ReactNode;
  /** Active locale — passed explicitly so this stays statically renderable (no headers() read). */
  locale: string;
  /**
   * Path of the page rendering this content, used only to build absolute URLs for the ad
   * JSON-LD. Optional and additive, so the other call sites are unaffected.
   */
  canonicalPath?: string;
}

export default async function RichText({ content, className = '', injectBeforeLastH2, locale, canonicalPath }: RichTextProps) {
  if (!content) return null;

  // CKEditor HTML string
  if (typeof content === 'string') {
    if (!content.trim()) return null;
    const t = await getTranslations({ locale, namespace: 'reviews' });
    const widgetData = await prefetchWidgetData(content, locale);
    const prosLabel = t('pros');
    const consLabel = t('cons');

    // Ad ordering comes from the document, so the index and the numbered headings can never
    // disagree: reordering the body reorders the index and renumbers the headings for free.
    const orderedIds = extractCommercialIds(content);
    const commercials: CommercialContext = {
      ordered: orderedIds
        .map((id) => widgetData.get(`commercial:${id}`) as Commercial | undefined)
        .filter((c): c is Commercial => Boolean(c)),
      ordinals: new Map(orderedIds.map((id, i) => [id, i + 1])),
      canonicalPath,
    };

    const parsed = parse(content, {
      replace: (node) => replaceNode(node, prosLabel, consLabel, widgetData, locale, commercials),
    });
    const wrapperClass = `rich-text-content space-y-4 max-w-none ${className}`;

    // When injecting a custom node, render it as a SIBLING outside .rich-text-content (and the
    // page's `prose` wrapper) so it's treated as a standalone component, not article content.
    if (injectBeforeLastH2) {
      const children: ReactNode[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      let lastH2 = -1;
      children.forEach((c, i) => { if (isValidElement(c) && c.type === 'h2') lastH2 = i; });
      if (lastH2 >= 0) {
        return (
          <>
            <div className={wrapperClass}>{children.slice(0, lastH2)}</div>
            {injectBeforeLastH2}
            <div className={wrapperClass}>{children.slice(lastH2)}</div>
          </>
        );
      }
      return (
        <>
          <div className={wrapperClass}>{children}</div>
          {injectBeforeLastH2}
        </>
      );
    }

    return <div className={wrapperClass}>{parsed}</div>;
  }

  // Legacy blocks format (array) — not expected from CKEditor
  if (!Array.isArray(content) || content.length === 0) return null;

  return (
    <div className={`space-y-4 ${className}`}>
      {parse((content as { __html: string }[])[0]?.__html ?? '', {
        // Legacy path: no widget data, so ad widgets render as empty nodes here.
        replace: (node) =>
          replaceNode(node, '', '', new Map(), 'en', { ordered: [], ordinals: new Map() }),
      })}
    </div>
  );
}
