import parse, { type DOMNode, Element } from 'html-react-parser';
import { isValidElement, type ReactNode } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import ProsConsBlock from '@/components/rich-text/ProsConsBlock';
import SiteCardInline from '@/components/rich-text/SiteCardInline';
import SiteCardInlineList from '@/components/rich-text/SiteCardInlineList';
import ArticleCard from '@/components/ArticleCard';
import { prefetchWidgetData, type WidgetData } from '@/lib/richTextWidgets';
import { type Site, type Article } from '@/lib/strapi';

const ELEMENT_CLASSES: Record<string, string> = {
  p: 'text-base leading-relaxed text-slate-700 dark:text-slate-300',
  h1: 'text-2xl font-bold text-slate-900 dark:text-white mt-6 mb-3',
  h2: 'text-xl font-bold text-slate-900 dark:text-white mt-5 mb-2',
  h3: 'text-lg font-semibold text-slate-900 dark:text-white mt-4 mb-2',
  h4: 'text-base font-semibold text-slate-900 dark:text-white mt-3 mb-1',
  h5: 'text-sm font-semibold text-slate-900 dark:text-white mt-3 mb-1',
  h6: 'text-sm font-medium text-slate-900 dark:text-white mt-2 mb-1',
  ul: 'list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300',
  ol: 'list-decimal list-inside space-y-1 text-slate-700 dark:text-slate-300',
  li: 'text-slate-700 dark:text-slate-300',
  a: 'text-emerald-600 hover:underline dark:text-emerald-400',
  blockquote: 'border-l-4 border-emerald-400 pl-4 italic text-slate-600 dark:border-emerald-600 dark:text-slate-400',
  code: 'rounded bg-slate-100 px-1 py-0.5 font-mono text-sm dark:bg-slate-800',
  pre: 'overflow-x-auto rounded-lg bg-slate-100 p-4 font-mono text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  img: 'rounded-lg max-w-full h-auto',
  table: 'w-full border-collapse text-sm text-slate-700 dark:text-slate-300',
  th: 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-left font-semibold',
  td: 'border border-slate-200 dark:border-slate-700 px-3 py-2',
};

// Rich-text CTA button: the CKEditor "Button Style" decorator marks the <a> with `data-button`;
// we map it to Tailwind utilities at render — no bespoke CSS and no descendant selector that
// could leak into nested components. (Literal here so Tailwind generates these utilities.)
const RT_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-4 text-lg font-bold text-white no-underline transition hover:bg-emerald-700 active:scale-95 dark:bg-emerald-500 dark:hover:bg-emerald-600';

function replaceNode(domNode: DOMNode, prosLabel: string, consLabel: string, widgetData: WidgetData, locale: string) {
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
}

interface RichTextProps {
  content: unknown;
  className?: string;
  /** Optional node spliced in immediately before the last top-level <h2> (appended if none). */
  injectBeforeLastH2?: ReactNode;
}

export default async function RichText({ content, className = '', injectBeforeLastH2 }: RichTextProps) {
  if (!content) return null;

  // CKEditor HTML string
  if (typeof content === 'string') {
    if (!content.trim()) return null;
    const [t, locale] = await Promise.all([
      getTranslations('reviews'),
      getLocale(),
    ]);
    const widgetData = await prefetchWidgetData(content, locale);
    const prosLabel = t('pros');
    const consLabel = t('cons');
    const parsed = parse(content, { replace: (node) => replaceNode(node, prosLabel, consLabel, widgetData, locale) });
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
      {parse((content as { __html: string }[])[0]?.__html ?? '', { replace: (node) => replaceNode(node, '', '', new Map(), 'en') })}
    </div>
  );
}
