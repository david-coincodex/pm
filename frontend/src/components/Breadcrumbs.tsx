'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import Container from './Container';

function humanize(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function Breadcrumbs() {
  const pathname = usePathname();
  const t = useTranslations('breadcrumbs');

  // Don't render on the homepage
  if (pathname === '/') return null;

  const segments = pathname.split('/').filter(Boolean);

  // Build crumbs: Home + one per segment
  const crumbs: { label: string; href: string }[] = [
    { label: t('home'), href: '/' },
  ];

  let accumulated = '';
  for (const segment of segments) {
    accumulated += `/${segment}`;
    // Use translated label for known top-level segments, humanize the rest
    const label = t.has(segment) ? t(segment) : humanize(segment);
    crumbs.push({ label, href: accumulated });
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950"
    >
      <Container>
        <ol className="flex items-center gap-1.5 py-2.5 text-sm">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <li key={crumb.href} className="flex items-center gap-1.5">
                {i > 0 && (
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
                {isLast ? (
                  <span className="font-medium text-slate-900 dark:text-white truncate max-w-[200px]">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </Container>
    </nav>
  );
}
