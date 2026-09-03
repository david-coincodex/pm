import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { siteSettings } from '@/lib/siteSettings';
import { routes } from '@/lib/routes';
import { localizedAlternates } from '@/lib/pagination';
import { strapiMediaUrl } from '@/lib/strapi';
import { getOnlineModels, findOnlineModel, adapterById } from '@/lib/cams/registry';
import { findKnownModel } from '@/lib/cams/modelDb';
import { getCamCategories, categoriesForModel, crossProviderTags } from '@/lib/cams/categories';
import { PROVIDER_META } from '@/lib/cams/providers/meta';
import { parseActivity, activitySummary, MIN_HEATMAP_HOURS, SESSION_GAP_MS } from '@/lib/cams/activity';
import { pickNextModel } from '@/lib/cams/query';
import { camCategoryPath } from '@/lib/cams/filters';
import { providerFromSlug, CAM_PROVIDER_NAMES, type CamProvider } from '@/lib/cams/types';
import { cleanCamUsername } from '@/lib/cams/urls';
import Breadcrumbs from '@/components/Breadcrumbs';
import CamPlayer from '@/components/cams/CamPlayer';
import CamSoundButton from '@/components/cams/CamSoundButton';
import CamCtaLink from '@/components/cams/CamCtaLink';
import CamFavoriteButton from '@/components/cams/CamFavoriteButton';
import CamModelCard from '@/components/cams/CamModelCard';
import { CamGrid } from '@/components/cams/CamGrid';
import CamThumbFallback from '@/components/cams/CamThumbFallback';
import CamSiteOffer from '@/components/cams/CamSiteOffer';
import CamModelStats from '@/components/cams/CamModelStats';
import CamCategoryChips from '@/components/cams/CamCategoryChips';
import CamModelPhotos from '@/components/cams/CamModelPhotos';
import CamActivityHeatmap from '@/components/cams/CamActivityHeatmap';
import CamLiveBadge from '@/components/cams/CamLiveBadge';
import CountryFlag from '@/components/ui/CountryFlag';
import SectionTitle from '@/components/SectionTitle';
import SidebarCategorySites from '@/components/SidebarCategorySites';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';

type Props = { params: Promise<{ locale: string; site: string; username: string }> };

/** Same cadence as the listings: a room's page is worth caching for as long as its data is. */
export const revalidate = 30;

/**
 * Existence, resolved once for metadata and page alike. A model EXISTS when it is live right
 * now (snapshot) or the persistent registry has ever seen it (Strapi). Neither → 404: garbage
 * usernames must not render (or get indexed as) phantom "offline model" pages. Registry
 * unreachable → fail open with known=null: a CMS blip must never mass-404 indexed pages —
 * the page renders its offline state and metadata falls back to noindex.
 */
async function resolveModel(provider: CamProvider, username: string) {
  const model = await findOnlineModel(provider, username);
  const known = await findKnownModel(provider, username);
  if (!model && known.status === 'missing') notFound();
  return { model, known: known.status === 'found' ? known.model : null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, site, username } = await params;
  const provider = providerFromSlug(site);
  if (!provider) return {};
  const name = cleanCamUsername(username);
  if (!name) return {};
  const [t, { model, known }] = await Promise.all([
    getTranslations({ locale, namespace: 'liveSex' }),
    resolveModel(provider, name),
  ]);
  const displayName = model?.displayName ?? known?.displayName ?? name;
  // lastSeenAt is bulk-touched every sync while the model streams, so floored to the hour it
  // is an honest, churn-free modified time. Emitted via openGraph so it renders as
  // <meta property="article:modified_time"> — OG consumers only read property= attributes,
  // and Next's `other:` field renders name= tags that nothing parses. Guarded parse: a
  // malformed datetime must drop the tag, not 500 the page from inside generateMetadata.
  const lastSeenMs = known?.lastSeenAt ? Date.parse(known.lastSeenAt) : NaN;
  const modifiedIso = Number.isFinite(lastSeenMs)
    ? new Date(lastSeenMs - (lastSeenMs % (60 * 60 * 1000))).toISOString()
    : null;
  return {
    // Same string as the H1 — one identity for the page.
    title: t('modelTitle', { name: displayName }),
    description: t('modelMetaDescription', { name: displayName }),
    // Known models are the SEO surface (models-sitemap.xml) — indexable with a canonical.
    // Only the fail-open render (registry unreachable, model offline) stays out of the index.
    robots: model || known ? { index: true, follow: true } : { index: false, follow: true },
    alternates: localizedAlternates(routes.camModel(provider, name), locale),
    ...(modifiedIso ? { openGraph: { type: 'article', modifiedTime: modifiedIso } } : {}),
  };
}

export default async function CamModelPage({ params }: Props) {
  if (!siteSettings.features.liveSex) notFound();
  const { locale, site, username: rawUsername } = await params;
  setRequestLocale(locale);
  // The first segment is the provider's category slug (chaturbate/bongacams) — anything
  // else at this depth is not a model URL.
  const provider = providerFromSlug(site);
  if (!provider) notFound();
  const adapter = adapterById.get(provider);
  if (!adapter) notFound();
  const meta = PROVIDER_META[provider];
  const username = cleanCamUsername(rawUsername);
  if (!username) notFound();

  const [t, format, categories, { model, known }, snapshot] = await Promise.all([
    getTranslations({ locale, namespace: 'liveSex' }),
    getFormatter({ locale }),
    getCamCategories(),
    resolveModel(provider, username),
    getOnlineModels(),
  ]);

  const displayName = model?.displayName ?? known?.displayName ?? username;
  const online = model !== null;
  const gender = model?.gender ?? known?.gender ?? null;
  const tags = model?.tags ?? known?.tags ?? [];
  const country = model?.country ?? known?.country ?? null;
  const lastSeenAt = !online && known?.lastSeenAt ? new Date(known.lastSeenAt) : null;

  // Similarity compares only tags that mean something across providers, so a provider's own
  // vocabulary can't make "same cam site" look like "similar model" (see crossProviderTags).
  const similarityTags = crossProviderTags(tags, categories);
  const nextModel = model ? pickNextModel(snapshot, model, similarityTags) : null;
  // The photo strip: the registry's media-library photos (ingested profile portrait plus
  // rotating live-snapshot captures, oldest → newest). A model the sync knows but the media
  // cron hasn't reached yet falls back to the feed's live portrait URL.
  const knownPhotos = (known?.photos ?? []).map((p, i) => ({ src: strapiMediaUrl(p), key: p.id != null ? `photo-${p.id}` : `photo-i-${i}` }));
  const photos: { src: string; key: string }[] = knownPhotos.length
    ? knownPhotos
    : model?.profileImageUrl
      ? [{ src: model.profileImageUrl, key: 'profile' }]
      : [];
  const showPhotos = photos.length > 0;
  // Offline cover, freshest first: the platform's live thumb URL (Chaturbate 404s these the
  // moment the room closes — expected), then our newest captured snapshot, then the placeholder.
  // Providers whose live thumb URL is rebuildable from the username get it fresh (it 404s the
  // moment the room closes — expected, the peer marker reveals our snapshot); the rest can only
  // use the registry's last-known URL, since their image paths are hashed.
  const offlineCover = meta.media.liveThumbDerivable ? adapter.thumbUrl(username) : (known?.thumbUrl ?? null);
  const offlineFallback = knownPhotos.length ? knownPhotos[knownPhotos.length - 1].src : null;
  const providerCategory = categories.find((c) => c.kind === 'provider' && c.providerKey === provider) ?? null;
  const providerSite = providerCategory?.site ?? null;
  const modelCategories = model ? categoriesForModel(model, categories) : [];
  // byViewers is already sorted, so this is one pass that stops at 12 rather than a full sort.
  // Offline models still steer by the registry's remembered gender/tags.
  const similar: typeof snapshot.byViewers = [];
  for (const m of snapshot.byViewers) {
    if (similar.length >= 12) break;
    if (m.id === `${provider}:${username}`) continue;
    if (
      gender &&
      !(
        m.gender === gender &&
        (similarityTags.length === 0 || m.tags.some((tag) => similarityTags.includes(tag)))
      )
    )
      continue;
    similar.push(m);
  }

  // Gate the heatmap server-side (windowed total hours is timezone-independent), so a
  // data-poor model never mounts a widget that would render empty or all-grey. The snapshot's
  // fetch time is "now" — render must stay pure, and it's within 45s of wall clock.
  const activityPairs = parseActivity(known?.activity, known?.lastSeenAt);
  const showHeatmap =
    activitySummary(activityPairs, snapshot.fetchedAtMs).totalHours >= MIN_HEATMAP_HOURS;

  const sidebar = (
    <div className="space-y-5">
      <CamSiteOffer site={providerSite} />
      {/* Session start: the live feed's own value when it publishes one, else the start the
          registry observed (see the sync controller) — one pill, two ways of knowing. The
          observed start is trusted only while lastSeenAt is fresh: a model who just returned
          after hours offline still carries the PREVIOUS session's start until the next sync
          write, and "Live for 23h" at minute one would be a lie. Same gap rule the backend
          uses to declare a session new. */}
      {online && model && (
        <CamModelStats
          model={model}
          nowMs={snapshot.fetchedAtMs}
          liveSince={
            model.onlineSince ??
            (known?.wentOnlineAt &&
            known.lastSeenAt &&
            snapshot.fetchedAtMs - Date.parse(known.lastSeenAt) <= SESSION_GAP_MS
              ? known.wentOnlineAt
              : null)
          }
        />
      )}
      <CamCategoryChips categories={modelCategories} />
      {showHeatmap && <CamActivityHeatmap activity={activityPairs} />}
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {t('modelPageNote', { name: displayName, provider: adapter.name })}
      </p>
    </div>
  );

  return (
    <>
      {/* A provider's player pulls its bundles + video from these origins the moment it mounts —
          warm the connections while the HTML still streams (React hoists these into <head>, same
          pattern as the rel=prev/next links on listings). Declared per provider in its meta, so
          only THIS provider's origins are warmed and a new provider brings its own. */}
      {online &&
        meta.media.preconnect.map((href) => <link key={href} rel="preconnect" href={href} />)}
      <Breadcrumbs
        locale={locale}
        width="full"
        crumbs={[
          { label: t('breadcrumb'), href: routes.liveSex() },
          // The platform between the hub and the model: Home > Live Sex > BongaCams > Name.
          // Via camCategoryPath and only when the editor-created category exists — a missing
          // row must not produce a crumb that links a 404.
          ...(providerCategory
            ? [{ label: CAM_PROVIDER_NAMES[provider], href: camCategoryPath(providerCategory) }]
            : []),
          { label: displayName, href: routes.camModel(provider, username) },
        ]}
      />
      {/* Full-width two-zone shell, same grammar as the browse pages: content left, cam-site
          deals right at xl. No max-width cap — the full width IS the layout. */}
      <div className="w-full px-4 pt-6 pb-10 sm:px-6 lg:px-8 lg:pt-8 lg:pb-14">
        <div className="lg:grid lg:grid-cols-[270px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[270px_minmax(0,1fr)_320px]">
          {/* Left rail: offer, stats, tags and the disclaimer — the facts column beside the
              player. Same 270px track as the browse pages, so navigation doesn't shift.
              z-30: sticky creates a stacking context, and without a z-index it paints in DOM
              order — i.e. UNDER the player column that follows — swallowing the heatmap
              tooltips the moment they extend past the rail's edge. Must clear the player's
              own overlays (z-20 control bar / z-10 click shield, promoted to the root
              context) while staying under the z-50 header. */}
          <aside className="hidden lg:block">
            <div className="lg:sticky lg:top-24 lg:z-30">{sidebar}</div>
          </aside>
          <div className="min-w-0">
          {/* The sitewide heading component: name-only H1 (badge/flag/avatar stay out of the
              accessible heading via its slots), action buttons at the row's right edge. */}
          <SectionTitle
            as="h1"
            title={t('modelTitle', { name: displayName })}
            badge={
              /* Live/offline tag and the country flag declutter the H1 on mobile — hidden below
                 lg, shown beside the title from lg up. */
              <span className="hidden items-center gap-2 lg:flex">
                {online ? (
                  <CamLiveBadge>{t('live')}</CamLiveBadge>
                ) : (
                  <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                    {t('offline')}
                  </span>
                )}
                {country && <CountryFlag country={country} className="h-6 w-6" locale={locale} />}
              </span>
            }
            actionsBelowOnMobile
            actions={<span className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
              {/* Primary action first, pulsing for attention (motion-safe: reduced-motion
                  visitors get a static button). */}
              <CamCtaLink
                provider={provider}
                username={username}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 motion-safe:animate-attention lg:flex-none lg:px-6 lg:py-3 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8m-8 4h5m7-2a9 9 0 01-13.2 7.96L3 21l1.1-3.3A8.96 8.96 0 013 12a9 9 0 0118 0z" />
                </svg>
                {online ? t('chatWith', { name: displayName }) : t('visitProfile', { name: displayName, provider: adapter.name })}
              </CamCtaLink>
              {/* Our sound button only drives OUR <video> (BongaCams). Chaturbate plays in its
                  own iframe, which owns its audio — a button here couldn't reach it. */}
              {/* Only when OUR surface owns the audio: a provider iframe or SDK player has
                  its own sound control that our store cannot reach. */}
              {online && !meta.video.ownsControls && <CamSoundButton />}
              <CamFavoriteButton
                provider={provider}
                username={username}
                displayName={displayName}
                thumbUrl={model?.thumbUrl ?? known?.thumbUrl ?? adapter.thumbUrl(username)}
                gender={gender ?? undefined}
                variant="page"
              />
              {nextModel && (
                <>
                  {/* Divider: everything left of it acts on THIS model; this one leaves. */}
                  <span className="mx-1 h-8 w-px bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
                  <Link
                    href={routes.camModel(nextModel.provider, nextModel.username)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-600 lg:flex-none lg:py-3 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-emerald-400"
                  >
                    {t('nextCam')}
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 12h14" />
                    </svg>
                  </Link>
                </>
              )}
            </span>}
          />

          {online && model ? (
            <CamPlayer model={model} displayName={displayName} outUrl={routes.camOut(provider, username)} />
          ) : (
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
              <CamThumbFallback displayName={displayName} />
              {/* Layered covers: the platform's live thumb URL wins while it serves a frame;
                  our newest captured snapshot is revealed ONLY when the platform image is dead
                  (peer marker) — never blended underneath a translucent live frame. */}
              {offlineCover && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={offlineCover}
                  alt={displayName}
                  data-cam-thumb=""
                  className="peer absolute inset-0 z-10 h-full w-full object-cover opacity-60 grayscale data-[broken]:opacity-0"
                />
              )}
              {offlineFallback && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={offlineFallback}
                  alt={displayName}
                  data-cam-thumb=""
                  className={`absolute inset-0 h-full w-full object-cover grayscale data-[broken]:opacity-0 ${
                    offlineCover ? 'opacity-0 peer-data-[broken]:opacity-60' : 'opacity-60'
                  }`}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <p className="max-w-md rounded-xl bg-black/60 p-4 text-center text-sm text-white backdrop-blur-sm">
                  {t('offlineHint', { name: displayName })}
                  {lastSeenAt && (
                    <span className="mt-1 block text-xs text-white/70">
                      {t('lastOnline', { time: format.relativeTime(lastSeenAt) })}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 lg:hidden">{sidebar}</div>

          {showPhotos && (
            <section className="mt-8">
              <SectionTitle title={t('recentSnapshots')} />
              <CamModelPhotos photos={photos} alt={displayName} />
            </section>
          )}

          {similar.length > 0 && (
            <section className="mt-12">
              <SectionTitle title={t('similarModels')} />
              {/* Mobile column count follows the visitor's per-row preference (like the browse
                  grid), so live previews autoplay the centered card only in 1-column layout;
                  desktop stays at 4 in this narrow content column. */}
              <CamGrid desktopClass="lg:grid-cols-4">
                {similar.map((m) => (
                  <CamModelCard key={m.id} model={m} />
                ))}
              </CamGrid>
            </section>
          )}
          </div>

          {/* lg has 2 columns but 3 grid children — without the span this aside auto-places
              into the 270px rail column on row 2. Full row at lg, own track at xl. */}
          <aside className="mt-10 lg:col-span-2 xl:col-span-1 xl:mt-0">
            <div className="xl:sticky xl:top-24">
              <Suspense>
                <SidebarCategorySites siteType="camsite" />
              </Suspense>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
