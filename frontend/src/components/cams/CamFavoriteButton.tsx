'use client';

import { useTranslations } from 'next-intl';
import { useFavorites } from '@/hooks/useFavorites';
import { useAuthModal } from '@/components/account/authModalContext';
import HeartIcon from '@/components/HeartIcon';
import Tooltip from '@/components/ui/Tooltip';
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

/** Heart toggle. Logged out → the SIGN-UP popup, since favoriting is the register funnel. */
/** Flag gate as a hook-free wrapper: an early return above hooks would break hooks rules. */
export default function CamFavoriteButton(props: Props) {
  // Accounts disabled for launch: no hearts anywhere (docs/enable-accounts.md).
  if (!siteSettings.features.accounts) return null;
  return <CamFavoriteButtonInner {...props} />;
}

function CamFavoriteButtonInner({
  provider,
  username,
  displayName,
  thumbUrl,
  gender,
  variant = 'card',
}: Props) {
  const t = useTranslations('account');
  const { loaded, loggedIn, isFavorite, toggle } = useFavorites();
  const { open: openAuth } = useAuthModal();
  const active = isFavorite(provider, username);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loaded) return;
    if (!loggedIn) {
      // The popup opens in place rather than navigating — the visitor is mid-browse on a grid
      // of live models, and sending them elsewhere loses both the page and the model they were
      // trying to save. It opens in SIGN-UP mode with the reason stated: most people tapping a
      // heart have no account yet, and an unexplained login form here looks like a wall.
      openAuth('register', t('favoritesAuthPrompt'));
      return;
    }
    void toggle({ provider, username, displayName, thumbUrl, gender });
  };

  const heart = (
    <HeartIcon className={variant === 'card' ? 'h-4 w-4' : 'h-5 w-5'} filled={active} />
  );
  /**
   * Says what the click will DO, which is the opposite of the state the heart already shows —
   * the same string the accessible name carries, so the hint and the screen reader agree.
   * Desktop-only: on touch there is no hover, and a tap must toggle the favorite rather than
   * explain it.
   */
  const hint = active ? t('removeFavorite') : t('addFavorite');

  if (variant === 'page') {
    return (
      <Tooltip content={hint} desktopOnly className="shrink-0">
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          // The label is always in the accessible name; sighted mobile users get the icon alone,
          // because this sits in a row with the primary chat CTA and the sound toggle.
          aria-label={active ? t('favorited') : t('addFavorite')}
          // SQUARE on mobile, exactly the mute button's box (h-11 w-11 rounded-xl shrink-0) so
          // the two icon buttons in this row match; from sm up it grows to fit the label.
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold transition sm:w-auto sm:gap-2 sm:px-4 ${
            active
              ? // Filled rose when on — the SAME signal as the card heart, so "favorited" looks
                // identical wherever it is shown.
                'border-rose-500 bg-rose-500 text-white hover:bg-rose-600 dark:border-rose-500 dark:bg-rose-500 dark:text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:border-rose-300 hover:text-rose-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-rose-400'
          }`}
        >
          {heart}
          <span className="hidden sm:inline">{active ? t('favorited') : t('favoriteAction')}</span>
        </button>
      </Tooltip>
    );
  }

  return (
    /**
     * The corner positioning lives on a WRAPPER rather than on the button, because the button
     * is now the tooltip's trigger and the tooltip needs `position: relative` around it to
     * anchor its bubble. Two position utilities on one element would just fight.
     *
     * `align="end"` because the heart sits in the card's top-RIGHT corner: a centred bubble
     * would hang off the card's edge.
     */
    <div className="absolute right-2 top-2 z-10">
      <Tooltip content={hint} desktopOnly align="end">
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          aria-label={active ? t('favorited') : t('addFavorite')}
          className={`flex h-8 w-8 items-center justify-center rounded-full shadow-sm backdrop-blur-sm transition ${
            active ? 'bg-rose-500 text-white' : 'bg-black/50 text-white hover:bg-rose-500'
          }`}
        >
          {heart}
        </button>
      </Tooltip>
    </div>
  );
}
