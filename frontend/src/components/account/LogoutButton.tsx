'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';

export default function LogoutButton() {
  const t = useTranslations('account');
  const pathname = usePathname();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch('/api/auth/logout/', { method: 'POST' });
        /**
         * A full document load either way, because the session is an httpOnly cookie: only a
         * fresh render makes the server components (and the header's account control) agree
         * that we are signed out. Signing out FROM an account page has to leave it — those
         * pages bounce a signed-out visitor into the sign-in popup, which would be an absurd
         * thing to show somebody who just asked to leave. Anywhere else, reload in place so
         * they keep the page they were reading.
         */
        if (pathname.startsWith('/account')) window.location.assign('/');
        else window.location.reload();
      }}
      className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {t('logout')}
    </button>
  );
}
