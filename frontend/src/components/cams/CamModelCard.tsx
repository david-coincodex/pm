import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { routes } from '@/lib/routes';
import { CAM_PROVIDER_NAMES, type CamModel } from '@/lib/cams/types';
import { PROVIDER_META } from '@/lib/cams/providers/meta';
import { compactNumber } from '@/lib/format';
import CamModelCardFrame from './CamModelCardFrame';
import CamThumbFallback from './CamThumbFallback';
import CamFavoriteButton from './CamFavoriteButton';
import CamCardPreview from './CamCardPreview';
import CountryFlag from '@/components/ui/CountryFlag';

/**
 * One live model in the grid. Plain <img> (provider CDN thumbs; the codebase never routes
 * external images through next/image). Stretched-link pattern: the whole card navigates to
 * our model page via an absolutely-positioned overlay link, and the heart sits ABOVE it
 * (z-10) — a <button> nested inside an <a> would be invalid HTML.
 *
 * `priority` is for the first row only: those thumbs are the LCP candidates, so they load
 * eagerly at high priority while everything below the fold stays lazy.
 */
export default function CamModelCard({
  model,
  priority = false,
  live = true,
}: {
  model: CamModel;
  priority?: boolean;
  live?: boolean;
}) {
  const t = useTranslations('liveSex');
  const locale = useLocale();
  // Only providers whose `viewers` is a real concurrent-audience count get the badge.
  const showViewerCount = PROVIDER_META[model.provider].ranking.viewersComparable;

  return (
    <CamModelCardFrame
      media={
        <>
          <CamThumbFallback displayName={model.displayName} />
          {/* A provider thumb 404s the moment its model goes offline, and BongaCams has no
              derivable URL for one at all. data-cam-thumb + data-[broken] let the layout's
              error handler fade a dead image out to the card's own placeholder tile. */}
          {model.thumbUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={model.thumbUrl}
              alt={model.displayName}
              width={320}
              height={240}
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
              decoding="async"
              data-cam-thumb=""
              className="absolute inset-0 h-full w-full object-cover data-[broken]:opacity-0"
            />
          )}
          {/* Live preview replaces the old hover-zoom: desktop plays on hover, mobile plays
              the most-centered card. Sits above the thumb, below badges/heart/link. WHAT plays
              is the provider's business (its video plugin), and WHETHER anything can play is
              CamCardPreview's own gate — asking here about specific fields like streamUrl or
              embedUrl silently excluded providers that play through neither (an SDK player). */}
          {live && <CamCardPreview model={model} />}
          {/* No LIVE tag: everything listed IS live, or it wouldn't be here. Icon + compact
              count ("14.1K") top-left; the heart owns the top-right corner. The COUNT is shown
              only for providers whose number is a real audience size (see the provider's
              ranking metadata) — one reports guests in a free room (0-7, usually 0), and
              printing that as a viewer count next to a "1.2K" card would misinform rather than
              inform. The flag still shows. */}
          {live && (
            <span className="absolute left-2 top-2 flex items-center gap-1.5">
              {showViewerCount && (
              <span
                className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1 1 0 010-.639C3.423 7.51 7.36 4.5 12 4.5s8.577 3.01 9.964 7.183a1 1 0 010 .639C20.577 16.49 16.64 19.5 12 19.5s-8.577-3.01-9.964-7.178z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {compactNumber(model.viewers, locale)}
                <span className="sr-only">{t('viewers', { count: model.viewers })}</span>
              </span>
              )}
              {model.country && <CountryFlag country={model.country} className="h-5 w-5" locale={locale} />}
            </span>
          )}
          {/* z-10 keeps the heart clickable above the card's navigation overlay below. */}
          <CamFavoriteButton
            provider={model.provider}
            username={model.username}
            displayName={model.displayName}
            thumbUrl={model.thumbUrl}
            gender={model.gender}
          />
        </>
      }
      name={<span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{model.displayName}</span>}
      badge={
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-700 dark:text-slate-400">
          {CAM_PROVIDER_NAMES[model.provider] ?? model.provider}
        </span>
      }
      overlay={
        /* Stretched link over the whole card — the heart (z-10) stays clickable above it. */
        <Link
          href={routes.camModel(model.provider, model.username)}
          aria-label={model.displayName}
          className="absolute inset-0"
        />
      }
    />
  );
}
