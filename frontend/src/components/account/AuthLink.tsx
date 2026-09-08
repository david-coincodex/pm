'use client';

import { Link } from '@/i18n/navigation';
import { routes } from '@/lib/routes';
import { useAuthModal, type AuthMode } from './authModalContext';

/**
 * A "Sign in" / "Create account" link that opens the popup IN PLACE.
 *
 * It renders a real `<Link>` to `/?auth=<mode>` so the control still works with JS disabled and
 * can be opened in a new tab — but a plain left-click is intercepted and turned into an in-page
 * `open()`, so the visitor stays on the page they were reading instead of being thrown to the
 * home page with the popup on top of it. (That bounce was the whole complaint: the href is the
 * fallback, not the intended path.)
 *
 * Server components can render this — the interactivity is sealed inside it — which is why the
 * filter page and the confirm page use it instead of a bare `<Link href={routes.login()}>`.
 */
export default function AuthLink({
  mode = 'login',
  message,
  className,
  children,
}: {
  mode?: AuthMode;
  /** Passed straight to open(): the reason shown inside the card. */
  message?: string;
  className?: string;
  /** The visible label — always a translated string at every call site. */
  children: string;
}) {
  const { open } = useAuthModal();
  const href = mode === 'register' ? routes.register() : routes.login();

  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        // Let the browser handle new-tab / new-window / download intents — only a plain
        // primary-button click should be turned into an in-page open.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        open(mode, message);
      }}
    >
      {children}
    </Link>
  );
}
