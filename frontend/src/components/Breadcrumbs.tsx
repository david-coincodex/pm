import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import Container from './Container';
import { routing } from '@/i18n/routing';
import { siteSettings } from '@/lib/siteSettings';
import type { Crumb } from '@/lib/breadcrumbs';

interface BreadcrumbsProps {
  /** Trail after Home (Home is prepended automatically). Rendered server-side. */
  crumbs: Crumb[];
  /** Colour variant. Use 'dark' when the breadcrumbs sit over a dark hero. */
  variant?: 'light' | 'dark';
  /** Active locale — passed explicitly so this stays statically renderable (no headers() read). */
  locale: string;
  /**
   * Match the page's column width. 'boxed' (default) is the site-wide max-w-7xl Container;
   * 'full' spans the viewport with edge padding — for full-width surfaces like /live-sex/.
   */
  width?: 'boxed' | 'full';
}

export default async function Breadcrumbs({ crumbs, variant = 'light', locale, width = 'boxed' }: BreadcrumbsProps) {
  const t = await getTranslations({ locale, namespace: 'breadcrumbs' });
  const isDark = variant === 'dark';

  const all: Crumb[] = [{ label: t('home'), href: '/' }, ...crumbs];
  const localePrefix = locale === routing.defaultLocale ? '' : `/${locale}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.label,
      item: `${siteSettings.baseUrl}${localePrefix}${crumb.href}`,
    })),
  };

  // NOT a component defined in render (that remounts the subtree every render) — build the
  // list once and wrap the finished element.
  const list = (
    <>
        <ol className="flex items-center gap-1.5 text-sm">
          {all.map((crumb, i) => {
            const isLast = i === all.length - 1;
            // Home crumb: home icon on mobile, label on sm+ (label kept for screen readers via sr-only).
            const content = i === 0 ? (
              <>
                <svg className="h-4 w-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span className="sr-only sm:not-sr-only">{crumb.label}</span>
              </>
            ) : crumb.label;
            return (
              /* Index-qualified: two crumbs may legitimately share an href (a filter whose
                 provider has no category page yet falls back to the hub). */
              <li key={`${i}-${crumb.href}`} className="flex items-center gap-1.5">
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
                    {content}
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
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
    </>
  );

  return (
    <nav aria-label={t('label')} className="relative z-20 flex h-10 items-center">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {width === 'full' ? (
        <div className="w-full px-4 sm:px-6 lg:px-8">{list}</div>
      ) : (
        <Container padded={false}>{list}</Container>
      )}
    </nav>
  );
}
