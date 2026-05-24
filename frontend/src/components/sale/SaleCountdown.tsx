'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface SaleCountdownProps {
  endsAt: string;
  themeColor: string;
}

export default function SaleCountdown({ endsAt, themeColor }: SaleCountdownProps) {
  const t = useTranslations('sale');
  const [timeLeft, setTimeLeft] = useState<ReturnType<typeof calcTimeLeft> | undefined>(undefined);

  useEffect(() => {
    setTimeLeft(calcTimeLeft(endsAt));
    const interval = setInterval(() => setTimeLeft(calcTimeLeft(endsAt)), 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  // Not yet mounted — render nothing to avoid hydration mismatch
  if (timeLeft === undefined) return null;

  if (timeLeft === null) {
    return <p className="text-sm text-slate-400">{t('expired')}</p>;
  }

  return (
    <div className="flex items-center gap-3 text-white">
      <span className="text-sm font-medium opacity-80">{t('endsIn')}</span>
      <div className="flex items-center gap-2">
        {timeLeft.days > 0 && (
          <Segment value={timeLeft.days} label={t('days', { count: timeLeft.days })} color={themeColor} />
        )}
        <Segment value={timeLeft.hours} label={t('hours', { count: timeLeft.hours })} color={themeColor} />
        <Segment value={timeLeft.minutes} label={t('minutes', { count: timeLeft.minutes })} color={themeColor} />
        <Segment value={timeLeft.seconds} label={t('seconds', { count: timeLeft.seconds })} color={themeColor} />
      </div>
    </div>
  );
}

function Segment({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div
      className="flex min-w-[3rem] flex-col items-center rounded-lg px-3 py-1.5 text-center"
      style={{ backgroundColor: color + '33' }}
    >
      <span className="text-xl font-black tabular-nums leading-none" style={{ color }}>
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest opacity-70">{label}</span>
    </div>
  );
}

function calcTimeLeft(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}
