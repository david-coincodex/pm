'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import PopoverSheet from '@/components/PopoverSheet';
import AuthForm from './AuthForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import SetPasswordForm from './SetPasswordForm';
import ResetPasswordForm from './ResetPasswordForm';
import SuccessCheck from './SuccessCheck';
import { Notice } from './ui';
import type { AuthMode } from './authModalContext';

/**
 * The account popup: sign in, sign up, and asking for a reset link — the site's only door to an
 * account, since there are no standalone login or register pages.
 *
 * Built on PopoverSheet, the same component the language switcher, the payment-methods list and
 * the upsell popup use — so it is a bottom sheet on phones and a centred card on desktop,
 * animated, Esc- and backdrop-closable, scroll-locking and portalled to body, all without this
 * file knowing about any of it. (It replaced a hand-rolled native `<dialog>`: that gave focus
 * trapping for free, but it meant a second popup idiom in one codebase and needed its own
 * portal anyway, to survive the header's backdrop-blur and the drawer's transform.)
 *
 * "Forgot your password?" is a MODE here rather than a link to /account/forgot-password/: the
 * visitor stays in the same card instead of being thrown onto a page mid-task, and can step
 * back to sign-in without losing the popup. The page still exists for direct links.
 */
export default function AuthModal({
  open,
  initialMode = 'login',
  initialError,
  infoMessage,
  onClose,
}: {
  open: boolean;
  initialMode?: AuthMode;
  /** Error code from a redirect back into the popup — currently a failed Google sign-in. */
  initialError?: string;
  /** Why the popup opened, when something opened it on the visitor's behalf. */
  infoMessage?: string;
  onClose: () => void;
}) {
  const t = useTranslations('account');

  /**
   * The mode lives HERE, not in AuthForm, because the popup's own header shows it: with the
   * state one level down, switching to "create account" left the heading reading "Welcome
   * back". PopoverSheet renders the title, so whatever owns the title must own the mode.
   */
  const [mode, setMode] = useState<AuthMode>(initialMode);
  /**
   * AuthForm's internal step, mirrored up here because the step outranks the mode for the
   * HEADING: after the address is submitted the card shows a tick and "we sent a link to …",
   * so a title still reading "Create your free account" would describe the previous screen.
   */
  const [step, setStep] = useState<'form' | 'check_email' | 'set_password'>('form');

  // Reopening starts from the mode the caller asked for (the heart wants sign-in, the header
  // CTA wants sign-up) — but only on the transition, or the in-popup switch would be undone by
  // any parent re-render. React's documented pattern for state derived from a changing prop,
  // and the same one NavMenu uses for its drawer.
  /**
   * The URL-borne error (a failed Google redirect) is consumable state, not a constant:
   * AuthForm is keyed on the mode, so without this a visitor who switched to sign-up and back
   * would see the stale "already has an account" banner re-materialize on the remount.
   */
  const [urlError, setUrlError] = useState(initialError);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode(initialMode);
      setUrlError(initialError);
      setStep('form');
    }
  }

  const switchMode = (next: AuthMode) => {
    setUrlError(undefined);
    setStep('form');
    setMode(next);
  };

  const titleByMode: Partial<Record<AuthMode, string>> = {
    'set-password': t('setPasswordTitle'),
    confirmed: t('confirmDoneTitle'),
    reset: t('resetTitle'),
    forgot: t('forgotTitle'),
    register: t('registerTitle'),
  };
  // Step transitions win over the mode title: register/forgot BOTH have a check_email step, and
  // a mode-keyed title (truthy for register) would otherwise short-circuit it — leaving the
  // inbox screen still headed "Create your free account". This was that bug.
  const title =
    step === 'check_email'
      ? t('checkEmailTitle')
      : step === 'set_password'
        ? t('setPasswordTitle')
        : titleByMode[mode] && mode !== 'login'
          ? (titleByMode[mode] as string)
          : mode === 'register'
            ? t('registerTitle')
            : mode === 'forgot'
              ? t('forgotTitle')
              : t('loginTitle');

  return (
    <PopoverSheet title={title} forceOpen={open} onClose={onClose}>
      {mode === 'set-password' ? (
        /* Arrived from a confirmation link: the session is already set by the route handler
           that redeemed the token, so this is step 3 with nothing left to prove. */
        <SetPasswordForm notice={t('confirmedNowSetPassword')} />
      ) : mode === 'reset' ? (
        /* Arrived from a reset link: the code lives in an httpOnly cookie, not the URL. */
        <ResetPasswordForm />
      ) : mode === 'confirmed' ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <SuccessCheck />
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('confirmDone')}</p>
        </div>
      ) : mode === 'forgot' ? (
        <ForgotPasswordForm onBack={() => switchMode('login')} />
      ) : (
        // Keyed on the mode so switching starts from a clean form: the two modes share almost
        // no fields, and a half-finished sign-up step must not bleed into sign-in.
        <AuthForm
          key={mode}
          mode={mode}
          initialError={urlError}
          infoMessage={infoMessage}
          onSwitchMode={switchMode}
          onStepChange={setStep}
        />
      )}
    </PopoverSheet>
  );
}
