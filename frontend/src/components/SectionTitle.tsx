import Link from 'next/link';
import type { ReactNode } from 'react';

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

interface SectionTitleProps {
  as?: HeadingLevel;
  title: string;
  /** Rendered beside the heading text — e.g. a live-count pill. Kept OUT of the heading
   * element so the count never becomes part of the page's H1 text. */
  badge?: ReactNode;
  /** Rendered before the heading — e.g. a model avatar. Kept OUT of the heading element. */
  leading?: ReactNode;
  /** Controls rendered at the heading row's right edge — e.g. view pills + density picker. */
  actions?: ReactNode;
  /** When true, actions sit beside the title on desktop but drop BELOW the green underline on
   * mobile (a grid layout instead of the wrapping heading row). Used by the listing controls;
   * the default keeps actions inline in the heading row. */
  actionsBelowOnMobile?: boolean;
  subtitle?: string;
  tag?: string;
  tagColor?: string;
  link?: string;
  linkLabel?: string;
  className?: string;
}

export default function SectionTitle({
  as: Tag = 'h2',
  title,
  badge,
  leading,
  actions,
  actionsBelowOnMobile = false,
  subtitle,
  tag,
  tagColor = 'text-emerald-600 dark:text-emerald-400',
  link,
  linkLabel,
  className = '',
}: SectionTitleProps) {
  const headingBlock = (
    <div>
      {tag && (
        <p className={`mb-1 text-xs font-semibold uppercase tracking-widest ${tagColor}`}>{tag}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {leading}
        <Tag
          className={`font-bold tracking-tight text-slate-900 dark:text-white ${
            Tag === 'h1' ? 'text-3xl sm:text-4xl' : Tag === 'h2' ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
          }`}
        >
          {title}
        </Tag>
        {badge}
      </div>
      {subtitle && <p className="mt-2 max-w-2xl text-base text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
  );
  const greenLine = <div className="mt-3 h-1 w-12 rounded-full bg-emerald-500" />;

  if (actionsBelowOnMobile) {
    // Grid: source order (heading → line → actions) is the MOBILE stack (actions below the
    // green line); on lg the actions jump to column 2, row 1 — beside the title.
    return (
      <div className={`mb-8 grid grid-cols-1 gap-x-4 lg:grid-cols-[1fr_auto] lg:items-center ${className}`}>
        <div className="lg:col-start-1 lg:row-start-1">{headingBlock}</div>
        <div className="lg:col-start-1 lg:row-start-2">{greenLine}</div>
        {actions && (
          <div className="mt-4 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:mt-0 lg:justify-self-end">{actions}</div>
        )}
      </div>
    );
  }

  return (
    <div className={`mb-8 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        {headingBlock}
        {actions}
        {link && linkLabel && (
          <Link
            href={link}
            className="shrink-0 text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {linkLabel} →
          </Link>
        )}
      </div>
      {greenLine}
    </div>
  );
}
