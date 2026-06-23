import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** Base path including trailing slash, e.g. "/" or "/de/" */
  basePath?: string;
}

function pageHref(page: number, basePath: string): string {
  return page === 1 ? basePath : `${basePath}?page=${page}`;
}

const DOTS = '…';

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/**
 * Build the list of items to render: always the first and last page, a window of
 * `siblingCount` pages on each side of the current page, and `…` for skipped ranges.
 */
function paginationRange(currentPage: number, totalPages: number, siblingCount = 1): (number | typeof DOTS)[] {
  // first + last + current + 2*siblings + 2 dots
  const totalPageNumbers = siblingCount * 2 + 5;

  // Not enough pages to need truncation — show them all.
  if (totalPageNumbers >= totalPages) {
    return range(1, totalPages);
  }

  const leftSibling = Math.max(currentPage - siblingCount, 1);
  const rightSibling = Math.min(currentPage + siblingCount, totalPages);

  const showLeftDots = leftSibling > 2;
  const showRightDots = rightSibling < totalPages - 1;

  if (!showLeftDots && showRightDots) {
    // Near the start: 1 2 3 4 5 … last
    const leftRange = range(1, 3 + siblingCount * 2);
    return [...leftRange, DOTS, totalPages];
  }

  if (showLeftDots && !showRightDots) {
    // Near the end: 1 … n-4 n-3 n-2 n-1 n
    const rightRange = range(totalPages - (3 + siblingCount * 2) + 1, totalPages);
    return [1, DOTS, ...rightRange];
  }

  // In the middle: 1 … k-1 k k+1 … last
  return [1, DOTS, ...range(leftSibling, rightSibling), DOTS, totalPages];
}

export default async function Pagination({ currentPage, totalPages, basePath = '/' }: PaginationProps) {
  const t = await getTranslations('pagination');
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  // Fewer page numbers on mobile (no sibling window) so the bar fits narrow screens;
  // a richer window on sm+.
  const mobilePages = paginationRange(currentPage, totalPages, 0);
  const desktopPages = paginationRange(currentPage, totalPages, 1);

  const linkBase =
    'inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors';
  const activeStyle = `${linkBase} bg-emerald-600 text-white shadow-sm pointer-events-none`;
  const inactiveStyle = `${linkBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700`;
  const disabledStyle = `${linkBase} border border-slate-100 bg-white text-slate-300 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600`;
  const dotsStyle = `${linkBase} text-slate-400 dark:text-slate-500 pointer-events-none select-none`;

  const renderPages = (pages: (number | typeof DOTS)[]) =>
    pages.map((page, i) =>
      page === DOTS ? (
        <span key={`dots-${i}`} className={dotsStyle} aria-hidden="true">
          {DOTS}
        </span>
      ) : page === currentPage ? (
        <span key={page} className={activeStyle} aria-current="page">
          {page}
        </span>
      ) : (
        <Link key={page} href={pageHref(page, basePath)} className={inactiveStyle}>
          {page}
        </Link>
      ),
    );

  return (
    <nav
      className="mt-10 flex items-center justify-center gap-1 sm:gap-1.5"
      aria-label={t('label')}
    >
      {hasPrev ? (
        <Link href={pageHref(currentPage - 1, basePath)} className={inactiveStyle} aria-label={t('prevPage')}>
          <span aria-hidden="true">←</span><span className="hidden sm:inline">&nbsp;{t('prev')}</span>
        </Link>
      ) : (
        <span className={disabledStyle} aria-disabled="true"><span aria-hidden="true">←</span><span className="hidden sm:inline">&nbsp;{t('prev')}</span></span>
      )}

      {/* Mobile: compact set; sm+: richer set */}
      <div className="flex items-center gap-1 sm:hidden">{renderPages(mobilePages)}</div>
      <div className="hidden items-center gap-1.5 sm:flex">{renderPages(desktopPages)}</div>

      {hasNext ? (
        <Link href={pageHref(currentPage + 1, basePath)} className={inactiveStyle} aria-label={t('nextPage')}>
          <span className="hidden sm:inline">{t('next')}&nbsp;</span><span aria-hidden="true">→</span>
        </Link>
      ) : (
        <span className={disabledStyle} aria-disabled="true"><span className="hidden sm:inline">{t('next')}&nbsp;</span><span aria-hidden="true">→</span></span>
      )}
    </nav>
  );
}
