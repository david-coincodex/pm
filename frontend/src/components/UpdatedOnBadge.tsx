interface UpdatedOnBadgeProps {
  modifiedDate: string;
  locale: string;
  updatedLabel: string;
}

export default function UpdatedOnBadge({ modifiedDate, locale, updatedLabel }: UpdatedOnBadgeProps) {
  const label = new Date(modifiedDate).toLocaleString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

  return (
    <span className="relative inline-flex items-center group">
      <span
        className="inline-flex items-center justify-center text-slate-400 dark:text-slate-500 cursor-default"
        aria-label={`${updatedLabel} ${label}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5"
        >
          <path d="M21.5 2v6h-6" />
          <path d="M2 12C2 6.48 6.48 2 12 2c3.17 0 6.01 1.4 8 3.62" />
          <path d="M2.5 22v-6h6" />
          <path d="M22 12c0 5.52-4.48 10-10 10-3.17 0-6.01-1.4-8-3.62" />
        </svg>
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity dark:bg-slate-700">
        {updatedLabel} {label}
      </span>
    </span>
  );
}
