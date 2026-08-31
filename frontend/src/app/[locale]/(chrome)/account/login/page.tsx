import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getUser } from '@/lib/auth';
import { routes } from '@/lib/routes';
import AuthForm from '@/components/account/AuthForm';
import { siteSettings } from '@/lib/siteSettings';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account' });
  return { title: t('login'), robots: { index: false } };
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  // Accounts disabled for launch (docs/enable-accounts.md).
  if (!siteSettings.features.accounts) notFound();
  const { locale } = await params;
  if (await getUser()) redirect(routes.favorites());
  const t = await getTranslations({ locale, namespace: 'account' });

  return (
    <div className="mx-auto w-full max-w-md px-4 py-14">
      <h1 className="mb-6 text-2xl font-black tracking-tight text-slate-900 dark:text-white">{t('loginTitle')}</h1>
      <AuthForm mode="login" />
    </div>
  );
}
