interface ProsConsBlockProps {
  pros: string[];
  cons: string[];
  prosLabel: string;
  consLabel: string;
}

export default function ProsConsBlock({ pros, cons, prosLabel, consLabel }: ProsConsBlockProps) {
  if (pros.length === 0 && cons.length === 0) return null;

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      {pros.length > 0 && (
        <div>
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">
            {prosLabel}
          </h3>
          <ul className="space-y-1.5">
            {pros.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-base text-slate-700 dark:text-slate-300">
                <svg className="mt-1 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {cons.length > 0 && (
        <div>
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">
            {consLabel}
          </h3>
          <ul className="space-y-1.5">
            {cons.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-base text-slate-700 dark:text-slate-300">
                <svg className="mt-1 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
