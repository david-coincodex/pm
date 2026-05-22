'use client';

import { useTranslations } from 'next-intl';
import PopoverSheet from '@/components/PopoverSheet';

const VISIBLE_COUNT = 4;

function MethodTile({ method, label, large = false }: { method: string; label: string; large?: boolean }) {
  if (large) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex h-14 w-full items-center justify-center rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/payment-logos/${method}.svg`}
            alt={label}
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <span className="w-full text-center text-[10px] leading-tight text-slate-600 dark:text-slate-300 line-clamp-2">
          {label}
        </span>
      </div>
    );
  }

  return (
    <div className="group relative flex items-center justify-center">
      <div className="flex h-9 w-14 items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 dark:border-slate-600 dark:bg-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/payment-logos/${method}.svg`}
          alt={label}
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-700">
        {label}
      </span>
    </div>
  );
}

interface PaymentMethodPillsProps {
  methods: string[];
}

export default function PaymentMethodPills({ methods }: PaymentMethodPillsProps) {
  const t = useTranslations('platform');

  if (methods.length === 0) return null;

  const hasOverflow = methods.length > 5;
  const visible = hasOverflow ? methods.slice(0, VISIBLE_COUNT) : methods;
  const overflowCount = methods.length - VISIBLE_COUNT;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {visible.map((method) => (
          <MethodTile key={method} method={method} label={t(method as never)} />
        ))}
        {hasOverflow && (
          <PopoverSheet
            title={t('paymentMethods')}
            trigger={
              <button
                type="button"
                className="flex h-9 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                +{overflowCount}
              </button>
            }
          >
            <div className="grid grid-cols-3 gap-1.5">
              {methods.map((method) => (
                <MethodTile key={method} method={method} label={t(method as never)} large />
              ))}
            </div>
          </PopoverSheet>
        )}
      </div>
    </div>
  );
}


