import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getUser } from '@/lib/auth';
import { routes } from '@/lib/routes';
import ChangePasswordForm from '@/components/account/ChangePasswordForm';
import DeleteAccountSection from '@/components/account/DeleteAccountSection';
import LogoutButton from '@/components/account/LogoutButton';
import { Link } from '@/i18n/navigation';
import { siteSettings } from '@/lib/siteSettings';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account' });
  return { title: t('settingsTitle'), robots: { index: false } };
}

/**
 * The account page: which address you are, how you sign in, changing the password, and closing
 * the account.
 *
 * The password section is decided on the server from the user's own record, and changing a
 * password ALWAYS costs the current one:
 *
 *  - password account → change-password (current password required).
 *  - Google account → no password form at all. Adding one would silently convert how the
 *    account signs in (stock users-permissions allows exactly one provider per account), which
 *    is a surprising thing to do to somebody who came in through Google. They keep using
 *    Google; the reset-by-email flow remains the escape hatch if they ever lose that access.
 *  - password account that never chose one (a signup abandoned mid-flow) → pointed at the
 *    reset link, since by definition it has no current password to type.
 *
 * `passwordSet` is readable on /users/me precisely so this choice needs no extra call.
 */
export default async function AccountSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  // Accounts disabled for launch (docs/enable-accounts.md).
  if (!siteSettings.features.accounts) notFound();
  const { locale } = await params;
  const user = await getUser();
  if (!user) {
    redirect({ href: routes.login(), locale });
    return null; // unreachable — redirect throws
  }
  const t = await getTranslations({ locale, namespace: 'account' });

  const isGoogle = user.provider === 'google';
  const hasOwnPassword = user.passwordSet === true && user.provider === 'local';

  return (
    <div className="mx-auto w-full max-w-md px-4 py-14">
      <div className="mb-8 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">{t('settingsTitle')}</h1>
        <LogoutButton />
      </div>

      <dl className="mb-10 space-y-3 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500 dark:text-slate-400">{t('email')}</dt>
          <dd className="font-medium text-slate-900 dark:text-white">{user.email}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500 dark:text-slate-400">{t('signInMethod')}</dt>
          <dd className="font-medium text-slate-900 dark:text-white">
            {isGoogle ? t('signInMethodGoogle') : t('signInMethodPassword')}
          </dd>
        </div>
      </dl>

      {isGoogle ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('googleOnlyNote')}</p>
      ) : hasOwnPassword ? (
        <>
          <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">{t('changePassword')}</h2>
          <ChangePasswordForm />
        </>
      ) : (
        <>
          <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">{t('changePassword')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('noPasswordYetNote')}{' '}
            <Link
              href={routes.forgotPassword()}
              className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              {t('forgotTitle')}
            </Link>
          </p>
        </>
      )}

      {/* Password accounts must re-enter their password to delete; a Google account cannot. */}
      <DeleteAccountSection requiresPassword={hasOwnPassword} />
    </div>
  );
}
