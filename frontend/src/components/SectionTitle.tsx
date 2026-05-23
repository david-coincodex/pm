import Link from 'next/link';

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

interface SectionTitleProps {
  as?: HeadingLevel;
  title: string;
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
  subtitle,
  tag,
  tagColor = 'text-emerald-600 dark:text-emerald-400',
  link,
  linkLabel,
  className = '',
}: SectionTitleProps) {
  return (
    <div className={`mb-8 ${className}`}>
      <div className="flex items-end justify-between gap-4">
        <div>
          {tag && (
            <p className={`mb-1 text-xs font-semibold uppercase tracking-widest ${tagColor}`}>
              {tag}
            </p>
          )}
          <Tag
            className={`font-bold tracking-tight text-slate-900 dark:text-white ${
              Tag === 'h1' ? 'text-3xl sm:text-4xl' : Tag === 'h2' ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
            }`}
          >
            {title}
          </Tag>
          {subtitle && (
            <p className="mt-2 max-w-2xl text-base text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
        {link && linkLabel && (
          <Link
            href={link}
            className="shrink-0 text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {linkLabel} →
          </Link>
        )}
      </div>
      <div className="mt-3 h-1 w-12 rounded-full bg-emerald-500" />
    </div>
  );
}
