'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useFavorites } from '@/hooks/useFavorites';
import { routes } from '@/lib/routes';
import HeartIcon from '@/components/HeartIcon';
import { siteSettings } from '@/lib/siteSettings';

interface Props {
  provider: string;
  username: string;
  displayName?: string;
  thumbUrl?: string;
  gender?: string;
  /** 'card' = small overlay heart; 'page' = labeled button. */
  variant?: 'card' | 'page';
}

/** Heart toggle. Logged out → the login page (favoriting is the register funnel). */
/** Flag gate as a hook-free wrapper: an early return above hooks would break hooks rules. */
export default function CamFavoriteButton(props: Props) {
  // Accounts disabled for launch: no hearts anywhere (docs/enable-accounts.md).
  if (!siteSettings.features.accounts) return null;
  return <CamFavoriteButtonInner {...props} />;
}

function CamFavoriteButtonInner({ provider, username, displayName, thumbUrl, gender, variant = 'card' }: Props) {
  const t = useTranslations('account');
  const router = useRouter();
  const { loaded, loggedIn, isFavorite, toggle } = useFavorites();
  const active = isFavorite(provider, username);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loaded) return;
    if (!loggedIn) {
      router.push(routes.login());
      return;
    }
    void toggle({ provider, username, displayName, thumbUrl, gender });
  };

  const heart = <HeartIcon className={variant === 'card' ? 'h-4 w-4' : 'h-5 w-5'} filled={active} />;

  if (variant === 'page') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
          active
            ? 'border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400'
            : 'border-slate-300 bg-white text-slate-700 hover:border-rose-300 hover:text-rose-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-rose-400'
        }`}
      >
        {heart}
        {active ? t('favorited') : t('addFavorite')}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? t('favorited') : t('addFavorite')}
      className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-sm backdrop-blur-sm transition ${
        active ? 'bg-rose-500 text-white' : 'bg-black/50 text-white hover:bg-rose-500'
      }`}
    >
      {heart}
    </button>
  );
}
