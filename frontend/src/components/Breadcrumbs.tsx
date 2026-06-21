'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import Container from './Container';
import { useBreadcrumbsContext } from './BreadcrumbsProvider';
import { routing } from '@/i18n/routing';
import { siteSettings } from '@/lib/siteSettings';

function humanize(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Path prefixes whose first page section has a dark background.
 *  Breadcrumbs on these routes will automatically use the dark variant. */
const DARK_HERO_PREFIXES = ['/sale/'];

interface BreadcrumbsProps {
  /** Override the colour variant. Defaults to auto-detection from pathname. */
  variant?: 'light' | 'dark';
}

export default function Breadcrumbs({ variant }: BreadcrumbsProps = {}) {
  const pathname = usePathname();
  const t = useTranslations('breadcrumbs');
  const locale = useLocale();
  const { crumbs: contextCrumbs } = useBreadcrumbsContext();

  const isDark =
    variant === 'dark' ||
    (variant !== 'light' && DARK_HERO_PREFIXES.some((prefix) => pathname.startsWith(prefix)));

  if (pathname === '/') return null;

  let crumbs: { label: string; href: string }[];

  if (contextCrumbs !== null) {
    crumbs = [{ label: t('home'), href: '/' }, ...contextCrumbs];
  } else {
    const segments = pathname.split('/').filter(Boolean);
    const nonLinkableSegments = new Set(['page', 'discounts']);
    crumbs = [{ label: t('home'), href: '/' }];
    let accumulated = '';
    for (const segment of segments) {
      accumulated += `/${segment}`;
      if (nonLinkableSegments.has(segment)) continue;
      const key = segment as Parameters<typeof t.has>[0];
      const label = t.has(key) ? t(key) : humanize(segment);
      crumbs.push({ label, href: accumulated });
    }
  }

  const localePrefix = locale === routing.defaultLocale ? '' : `/${locale}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.label,
      item: `${siteSettings.baseUrl}${localePrefix}${crumb.href}`,
    })),
  };

  return (
    <nav aria-label={t('label')} className="h-10 flex items-center relative z-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Container>
        <ol className="flex items-center gap-1.5 text-sm">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <li key={crumb.href} className="flex items-center gap-1.5">
                {i > 0 && (
                  <svg
                    className={`h-3.5 w-3.5 shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
                {isLast ? (
                  <span className={`font-medium truncate max-w-[200px] sm:max-w-none sm:overflow-visible sm:whitespace-normal ${isDark ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className={
                      isDark
                        ? 'text-slate-400 hover:text-white transition-colors'
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors'
                    }
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
