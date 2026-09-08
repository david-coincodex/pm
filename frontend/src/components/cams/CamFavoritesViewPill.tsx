'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useFavorites } from '@/hooks/useFavorites';
import { useAuthModal } from '@/components/account/authModalContext';

/**
 * The "favorites" view pill — the one control in CamListControls that cannot be a plain server
 * link, because what it should do depends on whether the visitor is signed in.
 *
 * Signed OUT it opens the sign-up popup with the reason stated, instead of navigating to a
 * favorites listing that could only say "sign in to see this". Signed in it is an ordinary
 * link, so the view stays shareable and survives a reload.
 *
 * Before the session probe answers it renders the LINK: that is the server-rendered markup, it
 * works without JavaScript, and the destination handles a signed-out visitor gracefully.
 *
 * It draws its own icon rather than taking one as a prop: `html-react-parser` pulls a second
 * copy of @types/react into the tree, so a `ReactNode` handed to next-intl's Link fails to
 * typecheck. Owning the glyph keeps the boundary to plain strings.
 */
export default function CamFavoritesViewPill({
  href,
  label,
  active,
  className,
}: {
  href: string;
  label: string;
  active: boolean;
  className: string;
}) {
  const t = useTranslations('account');
  const { loaded, loggedIn } = useFavorites();
  const { open: openAuth } = useAuthModal();

  const inner = (
    <>
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.05l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
      {label}
    </>
  );

  if (!loaded || loggedIn) {
    return (
      <Link href={href} aria-current={active ? 'true' : undefined} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => openAuth('register', t('favoritesAuthPrompt'))} className={className}>
      {inner}
    </button>
  );
}
