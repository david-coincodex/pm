'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { getMuted, getServerMuted, setMuted, subscribeMuted } from '@/lib/cams/soundPref';

/**
 * The stream's sound toggle, up in the header next to "Chat with me" — white bordered button,
 * same chrome as the favorite button. Drives the shared sound store the player follows; the
 * click is also the user gesture that lets the (reloaded) embed autoplay audibly.
 */
export default function CamSoundButton() {
  const t = useTranslations('liveSex');
  const muted = useSyncExternalStore(subscribeMuted, getMuted, getServerMuted);

  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      /* Icon-only SQUARE button — the label lives in aria-label (a swapping visible label made
         the header row too long on mobile). No aria-pressed: a state-flipping label + pressed
         state reads backwards to screen readers. */
      aria-label={muted ? t('unmute') : t('mute')}
      title={muted ? t('unmute') : t('mute')}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${
        muted
          ? 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-emerald-400'
          : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400'
      }`}
    >
      {muted ? (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H3v6h3l5 4V5zM22 9l-6 6m0-6l6 6" />
        </svg>
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 010 7M18.4 5.6a9 9 0 010 12.8" />
        </svg>
      )}
    </button>
  );
}
