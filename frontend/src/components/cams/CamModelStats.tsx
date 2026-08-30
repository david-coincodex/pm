import { useLocale, useTranslations } from 'next-intl';
import { compactNumber, formatDuration } from '@/lib/format';
import CountryFlag, { countryName } from '@/components/ui/CountryFlag';
import type { CamModel } from '@/lib/cams/types';
import Pill from '@/components/ui/Pill';

/**
 * The model's live stats — viewers, followers, live-for, location — as icon pills, every one
 * an instance of the shared Pill primitive.
 *
 * `nowMs` is the snapshot's own timestamp, passed in rather than Date.now(): render stays pure
 * (idempotent under re-render), and it is the MORE accurate clock anyway — onlineSince was
 * derived from the feed at exactly that moment.
 */
export default function CamModelStats({ model, nowMs }: { model: CamModel; nowMs: number }) {
  const t = useTranslations('liveSex');
  const locale = useLocale();
  const liveForMs = model.onlineSince ? nowMs - Date.parse(model.onlineSince) : null;

  return (
    // Two columns on mobile (stats sit inline under the player); one stacked column in the
    // desktop sidebar (270px rail). Pills are w-full, so each fills its grid cell.
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
      <Pill
        className="w-full"
        icon={
          <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1 1 0 010-.639C3.423 7.51 7.36 4.5 12 4.5s8.577 3.01 9.964 7.183a1 1 0 010 .639C20.577 16.49 16.64 19.5 12 19.5s-8.577-3.01-9.964-7.178z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        }
      >
        {t('viewers', { count: compactNumber(model.viewers, locale) })}
      </Pill>

      {model.followers !== undefined && (
        <Pill
          className="w-full"
          icon={
            <svg className="h-4 w-4 text-rose-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          }
        >
          {t('followers', { count: compactNumber(model.followers, locale) })}
        </Pill>
      )}

      {liveForMs !== null && liveForMs > 0 && (
        <Pill
          className="w-full"
          icon={
            <svg className="h-4 w-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
            </svg>
          }
        >
          {t('streamingFor', { duration: formatDuration(liveForMs) })}
        </Pill>
      )}

      {/* Country, not language (user decision) — the same flag circle the listing cards wear,
          so the two surfaces can never disagree about what the symbol means. */}
      {model.country && (
        <Pill className="w-full" icon={<CountryFlag country={model.country} className="h-4 w-4" locale={locale} />}>
          {countryName(model.country, locale)}
        </Pill>
      )}

      {model.location && (
        <Pill
          className="w-full"
          icon={
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
          }
        >
          {model.location}
        </Pill>
      )}
    </div>
  );
}
