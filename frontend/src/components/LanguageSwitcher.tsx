'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import PopoverSheet from './PopoverSheet';

const LOCALE_META: Record<string, { countryCode: string }> = {
  en: { countryCode: 'us' },
  de: { countryCode: 'de' },
};

/**
 * Only these two flags are ever rendered, so we serve them straight from public/
 * instead of pulling in the full ~250-flag `flag-icons` stylesheet (28 KB, formerly
 * render-blocking on every page from the root layout).
 *
 * `unoptimized` is deliberate: these are SVGs, and routing them through the image
 * optimizer would require `dangerouslyAllowSVG`.
 */
function Flag({ code, ratio, className }: { code: string; ratio: '1x1' | '4x3'; className?: string }) {
  const [w, h] = ratio === '1x1' ? [18, 18] : [21, 16];
  return (
    <Image
      src={`/flags/${ratio}/${code}.svg`}
      alt=""
      width={w}
      height={h}
      unoptimized
      className={className}
    />
  );
}

interface Props {
  showLabel?: boolean;
}

export default function LanguageSwitcher({ showLabel = false }: Props) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('language');
  const current = LOCALE_META[locale];

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next });
  }

  return (
    <PopoverSheet
      title={t('label')}
      trigger={(open) => (
        <button
          type="button"
          aria-label={t('label')}
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 md:py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {current && <Flag code={current.countryCode} ratio="1x1" className="rounded-full" />}
          <span className={showLabel ? '' : 'md:hidden'}>
            {t(locale as 'en' | 'de')}
          </span>
          <svg
            className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
    >
      <div>
        {routing.locales.map((loc) => {
          const meta = LOCALE_META[loc];
          const isActive = loc === locale;
          return (
            <button
              key={loc}
              type="button"
              onClick={() => switchLocale(loc)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors ${
                isActive
                  ? 'bg-slate-100 font-medium text-slate-900 dark:bg-slate-700 dark:text-white'
                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/60'
              }`}
            >
              {meta && <Flag code={meta.countryCode} ratio="4x3" className="rounded-sm" />}
              <span>{t(loc as 'en' | 'de')}</span>
              {isActive && (
                <svg className="ml-auto h-4 w-4 text-emerald-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </PopoverSheet>
  );
}
