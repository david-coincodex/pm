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

  if (timeLeft === null) {
    // Sale ended — show zeroed-out segments
    return (
      <div className="flex items-center gap-2">
        <Segment value={0} label={t('days', { count: 0 })} color={themeColor} />
        <Segment value={0} label={t('hours', { count: 0 })} color={themeColor} />
        <Segment value={0} label={t('minutes', { count: 0 })} color={themeColor} />
        <Segment value={0} label={t('seconds', { count: 0 })} color={themeColor} />
      </div>
    );
  }

  // Always render 4 fixed-width segment slots; show skeleton until mounted
  const isLoaded = timeLeft !== undefined;

  return (
    <div className="flex items-center gap-2">
      {/* Days slot — always reserved, hidden when 0 after load */}
      <Segment
        value={isLoaded ? timeLeft.days : undefined}
        label={t('days', { count: isLoaded ? timeLeft.days : 0 })}
        color={themeColor}
        hidden={isLoaded && timeLeft.days === 0}
      />
      <Segment
        value={isLoaded ? timeLeft.hours : undefined}
        label={t('hours', { count: isLoaded ? timeLeft.hours : 0 })}
        color={themeColor}
      />
      <Segment
        value={isLoaded ? timeLeft.minutes : undefined}
        label={t('minutes', { count: isLoaded ? timeLeft.minutes : 0 })}
        color={themeColor}
      />
      <Segment
        value={isLoaded ? timeLeft.seconds : undefined}
        label={t('seconds', { count: isLoaded ? timeLeft.seconds : 0 })}
        color={themeColor}
      />
    </div>
  );
}

function Segment({
  value,
  label,
  color,
  hidden,
}: {
  value: number | undefined;
  label: string;
  color: string;
  hidden?: boolean;
}) {
  if (hidden) return null;
  const isLoaded = value !== undefined;
  return (
    <div
      className="flex w-20 flex-col items-center rounded-lg px-3 py-2.5 text-center"
      style={{ backgroundColor: color + '33' }}
    >
      <span
        className={`h-9 w-10 text-3xl font-black tabular-nums leading-none ${isLoaded ? '' : 'animate-pulse rounded bg-white/20'}`}
        style={isLoaded ? { color } : undefined}
      >
        {isLoaded ? String(value).padStart(2, '0') : ''}
      </span>
      <span
        className={`mt-1 text-xs font-semibold uppercase tracking-widest opacity-70 ${isLoaded ? 'text-white' : 'animate-pulse rounded bg-white/20 text-transparent'}`}
      >
        {label}
      </span>
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
