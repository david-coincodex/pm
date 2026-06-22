'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { siteSettings } from '@/lib/siteSettings';
import PopoverSheet from '@/components/PopoverSheet';

type Phase = 'feedback' | 'thanks' | 'sorry';

interface UpsellPopupProps {
  open: boolean;
  onClose: () => void;
}

export default function UpsellPopup({ open, onClose }: UpsellPopupProps) {
  const t = useTranslations('upsell');
  const [phase, setPhase] = useState<Phase>('feedback');

  useEffect(() => {
    if (open) setPhase('feedback');
  }, [open]);

  function handleClose() {
    setPhase('feedback');
    onClose();
  }

  return (
    <PopoverSheet
      title={t('feedbackTitle')}
      forceOpen={open}
      onClose={handleClose}
    >
      {phase === 'feedback' && (
        <div className="flex items-center justify-center gap-3 py-2">
          <button
            type="button"
            onClick={() => setPhase('thanks')}
            className="rounded-xl bg-emerald-600 px-8 py-3 text-base font-bold text-white transition hover:bg-emerald-700 active:scale-95"
          >
            {t('feedbackYes')}
          </button>
          <button
            type="button"
            onClick={() => setPhase('sorry')}
            className="rounded-xl border border-slate-200 bg-white px-8 py-3 text-base font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            {t('feedbackNo')}
          </button>
        </div>
      )}

      {phase === 'thanks' && (
        <div className="text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600 dark:bg-emerald-600/20 dark:text-emerald-400">
            <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="mb-5 text-lg font-bold text-slate-900 dark:text-white">
            {t('feedbackThanks')}
          </p>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            {t('description')}
          </p>
          <div className="mb-4 rounded-xl border border-emerald-600/20 bg-emerald-600/5 p-4 dark:border-emerald-600/40 dark:bg-emerald-600/15">
            <p className="text-base font-bold text-slate-900 dark:text-white">
              {t('dealName')}
            </p>
            <div className="mt-2 flex items-center justify-center gap-3">
              <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {t('dealPrice')}
              </span>
              <span className="text-sm text-slate-400 line-through">
                {t('dealOriginalPrice')}
              </span>
              <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-600/25 dark:text-emerald-400">
                {t('dealDiscount')}
              </span>
            </div>
          </div>
          <a
            href="/adult-time/"
            className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-3.5 text-base font-bold text-white transition hover:bg-emerald-700 active:scale-95 dark:bg-emerald-600 dark:hover:bg-emerald-600"
          >
            {t('claimDeal')}
          </a>
        </div>
      )}

      {phase === 'sorry' && (
        <div className="py-2 text-center">
          <p className="mb-4 text-base text-slate-600 dark:text-slate-300">
            {t('feedbackSorry')}
          </p>
          <a
            href={`mailto:${siteSettings.supportEmail}`}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3 text-base font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            {t('contactSupport')}
          </a>
        </div>
      )}
    </PopoverSheet>
  );
}
