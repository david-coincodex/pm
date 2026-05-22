type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

interface SectionTitleProps {
  as?: HeadingLevel;
  title: string;
  subtitle?: string;
  className?: string;
}

export default function SectionTitle({ as: Tag = 'h2', title, subtitle, className = '' }: SectionTitleProps) {
  return (
    <div className={`mb-8 ${className}`}>
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
      <div className="mt-3 h-1 w-12 rounded-full bg-emerald-500" />
    </div>
  );
}
