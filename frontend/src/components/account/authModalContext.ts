'use client';

import { createContext, useContext } from 'react';

/**
 * The account popup's context, in its own module ON PURPOSE.
 *
 * It lives here rather than in AuthModalProvider because the form components consume it:
 * `ui.tsx` → AuthModalProvider → AuthModal → AuthForm → `ui.tsx` is a cycle, and a cycle here
 * resolves `useAuthModal` to undefined at module-eval time, which silently renders the whole
 * popup subtree as nothing. (Observed exactly that: the popup mounted and fetched its provider
 * config, but no card appeared.) Both ends importing this leaf module keeps the graph acyclic.
 */

/**
 * `set-password` and `confirmed` are the states an emailed link lands in: the route handler
 * redeems the token server-side, then sends the visitor to the HOME page with the popup in one
 * of these modes. That is why no /account/* page carries a token any more.
 */
export type AuthMode = 'login' | 'register' | 'forgot' | 'set-password' | 'confirmed' | 'reset';

export type AuthModalApi = {
  /**
   * `message` explains WHY the popup appeared — "sign in to save favorites" and the like. It
   * is shown inside the card, because a popup that opens with no stated reason reads as an
   * interruption; the caller knows the reason and nothing else does.
   */
  open: (mode?: AuthMode, message?: string) => void;
  close: () => void;
  /** '' until the provider lookup resolves, or when Google is off in the CMS. */
  googleClientId: string;
};

/** Opening is a no-op outside the provider (or with accounts disabled), never a crash. */
const NOOP: AuthModalApi = { open: () => {}, close: () => {}, googleClientId: '' };

export const AuthModalContext = createContext<AuthModalApi | null>(null);

export function useAuthModal(): AuthModalApi {
  return useContext(AuthModalContext) ?? NOOP;
}
