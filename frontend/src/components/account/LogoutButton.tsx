'use client';

import { useLocale, useTranslations } from 'next-intl';
import { getPathname } from '@/i18n/navigation';
import { routes } from '@/lib/routes';

export default function LogoutButton() {
  const t = useTranslations('account');
  const locale = useLocale();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch('/api/auth/logout/', { method: 'POST' });
        // Hard reload clears every cookie-derived state; getPathname keeps the locale prefix.
        window.location.assign(getPathname({ href: routes.liveSex(), locale }));
      }}
      className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {t('logout')}
    </button>
  );
}
