import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** Base path including trailing slash, e.g. "/" or "/de/" */
  basePath?: string;
}

function pageHref(page: number, basePath: string): string {
  return page === 1 ? basePath : `${basePath}?page=${page}`;
}

export default function Pagination({ currentPage, totalPages, basePath = '/' }: PaginationProps) {
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  const linkBase =
    'inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors';
  const activeStyle = `${linkBase} bg-emerald-600 text-white shadow-sm pointer-events-none`;
  const inactiveStyle = `${linkBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700`;
  const disabledStyle = `${linkBase} border border-slate-100 bg-white text-slate-300 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600`;

  return (
    <nav
      className="mt-10 flex items-center justify-center gap-1.5"
      aria-label="Pagination"
    >
      {hasPrev ? (
        <Link href={pageHref(currentPage - 1, basePath)} className={inactiveStyle} aria-label="Previous page">
          ← Prev
        </Link>
      ) : (
        <span className={disabledStyle} aria-disabled="true">← Prev</span>
      )}

      {pages.map((page) =>
        page === currentPage ? (
          <span key={page} className={activeStyle} aria-current="page">
            {page}
          </span>
        ) : (
          <Link key={page} href={pageHref(page, basePath)} className={inactiveStyle}>
            {page}
          </Link>
        ),
      )}

      {hasNext ? (
        <Link href={pageHref(currentPage + 1, basePath)} className={inactiveStyle} aria-label="Next page">
          Next →
        </Link>
      ) : (
        <span className={disabledStyle} aria-disabled="true">Next →</span>
      )}
    </nav>
  );
}
