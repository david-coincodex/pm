'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import UserIcon from '@/components/UserIcon';
import { routes } from '@/lib/routes';
import { useFavorites } from '@/hooks/useFavorites';
import { useAuthModal } from './authModalContext';

/**
 * The account control in the header and the mobile drawer.
 *
 * Signed out it is a GREEN CTA that opens the popup in SIGN-UP mode — most people who click it
 * do not have an account yet, and a neutral grey icon both hid the offer and greeted them with
 * "welcome back". Signed in it drops to a quiet icon linking to the account page: the CTA has
 * done its job and should stop shouting. People who do have an account switch to sign-in inside
 * the popup, which offers that in both modes.
 *
 * The session state comes from the favorites provider, which already probes /api/auth/me once
 * per page — the auth cookie is httpOnly, so a client component has no other way to know, and a
 * second probe here would double that request on every page.
 *
 * Until that probe resolves it renders the NEUTRAL icon, not the green CTA: a signed-in
 * visitor briefly being told to "create free account" is the worse of the two wrong states,
 * and it is exactly what makes signing in look like it did not work. The placeholder is a link
 * to the account page, which is right either way — signed in it goes there, signed out that
 * page bounces into the sign-in popup.
 */
export default function AccountNavButton({
  variant,
  onNavigate,
}: {
  variant: 'icon' | 'row';
  /** The mobile drawer closes itself when a row is used. */
  onNavigate?: () => void;
}) {
  const t = useTranslations('account');
  const { loaded, loggedIn } = useFavorites();
  const { open: openAuth } = useAuthModal();

  const quietClasses =
    variant === 'icon'
      ? 'flex h-[38px] w-[38px] items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
      : 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800';

  const ctaClasses =
    variant === 'icon'
      ? 'flex h-[38px] items-center gap-2 rounded-full bg-emerald-600 px-3.5 text-sm font-bold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600'
      : 'flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600';

  const cta = (
    <>
      <UserIcon className="h-4 w-4" />
      {/* The label only appears from xl up. Measured: with it on at lg the header row runs
          84px past a 1024px viewport (the search field is a fixed w-80), so below xl the
          button stays icon-only and its aria-label carries the meaning. */}
      <span className={variant === 'icon' ? 'hidden xl:inline' : ''}>{t('createFreeAccount')}</span>
    </>
  );

  // Signed in, OR not yet known: the quiet icon linking to the account page. Correct for a
  // signed-in visitor, and harmless for a signed-out one (that page bounces into the popup).
  if (!loaded || loggedIn) {
    return (
      <Link
        href={routes.accountSettings()}
        aria-label={variant === 'icon' ? t('myAccount') : undefined}
        onClick={onNavigate}
        className={quietClasses}
      >
        <UserIcon className={variant === 'icon' ? 'h-5 w-5' : 'h-4 w-4'} />
        {variant === 'row' && t('myAccount')}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.();
        openAuth('register');
      }}
      aria-label={variant === 'icon' ? t('createFreeAccount') : undefined}
      className={ctaClasses}
    >
      {cta}
    </button>
  );
}
