import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getUser, getFavorites, type FavoriteRow } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { getOnlineModels } from '@/lib/cams/registry';
import { adapterById } from '@/lib/cams/registry';
import { findKnownModels, type KnownCamModel } from '@/lib/cams/modelDb';
import { isCamProvider, type CamModel } from '@/lib/cams/types';
import CamModelCard from '@/components/cams/CamModelCard';
import { CamGrid } from '@/components/cams/CamGrid';
import CamThumbHead from '@/components/cams/CamThumbHead';
import CamFreshness from '@/components/cams/CamFreshness';
import SectionTitle from '@/components/SectionTitle';
import LogoutButton from '@/components/account/LogoutButton';
import { Link, redirect } from '@/i18n/navigation';
import { siteSettings } from '@/lib/siteSettings';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account' });
  return { title: t('favorites'), robots: { index: false } };
}

/** A stand-in CamModel for a favorited model that is currently offline. */
function offlineModel(f: FavoriteRow, known: KnownCamModel | undefined): CamModel | null {
  if (!isCamProvider(f.provider)) return null;
  const adapter = adapterById.get(f.provider);
  if (!adapter) return null;
  return {
    id: `${f.provider}:${f.username}`,
    provider: f.provider,
    username: f.username,
    displayName: f.displayName ?? f.username,
    gender: (f.gender as CamModel['gender']) || 'f',
    // Offline cover, freshest first: Chaturbate thumb URLs are deterministic (they 404 when
    // truly gone — the broken-img handler fades to the placeholder); BongaCams thumbs are
    // hashed, so the registry's last-seen URL is the only rebuildable one. The URL saved on
    // the favorite itself is the last resort for models the registry hasn't recorded.
    thumbUrl:
      f.provider === 'cb'
        ? adapter.thumbUrl(f.username)
        : (known?.thumbUrl ?? f.thumbUrl ?? adapter.thumbUrl(f.username)),
    affiliateUrl: adapter.outboundUrl(f.username),
    embedUrl: adapter.embedUrl(f.username),
    viewers: 0,
    tags: [],
    languages: [],
  };
}

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  // Accounts disabled for launch (docs/enable-accounts.md).
  if (!siteSettings.features.accounts) notFound();
  const { locale } = await params;
  const user = await getUser();
  // next-intl's redirect keeps the locale prefix; next/navigation's would drop it.
  if (!user) {
    redirect({ href: routes.login(), locale });
    return null; // unreachable — redirect throws; satisfies the null-narrowing below
  }

  const [t, tLive, favorites, snapshot] = await Promise.all([
    getTranslations({ locale, namespace: 'account' }),
    getTranslations({ locale, namespace: 'liveSex' }),
    getFavorites(),
    getOnlineModels(),
  ]);

  const onlineByKey = snapshot.byId; // prebuilt with the snapshot; no per-request Map to fill
  const online = favorites
    .map((f) => onlineByKey.get(`${f.provider}:${f.username}`))
    .filter((m): m is CamModel => Boolean(m));
  const offlineRows = favorites.filter((f) => !onlineByKey.has(`${f.provider}:${f.username}`));
  // One batch registry read covers every offline favorite's last-seen thumb URL.
  const knownByKey = await findKnownModels(offlineRows.map((f) => `${f.provider}:${f.username}`));
  const offline = offlineRows
    .map((f) => offlineModel(f, knownByKey.get(`${f.provider}:${f.username}`)))
    .filter((m): m is CamModel => m !== null);

  return (
    <div className="w-full px-4 pt-6 pb-10 sm:px-6 lg:px-8 lg:pt-8 lg:pb-14">
      {/* Offline favorites render provider/registry thumb URLs that go dead over time — this
          page is outside the live-sex layout, so it brings the broken-image fallback handler
          and the tab-freshness refresher itself (who is online changes by the minute). */}
      <CamThumbHead />
      <CamFreshness />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">{t('favorites')}</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">{user.email}</span>
          <LogoutButton />
        </div>
      </div>

      {favorites.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{t('favoritesEmpty')}</p>
          <Link
            href={routes.liveSex()}
            className="inline-block rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
          >
            {tLive('title')}
          </Link>
        </div>
      ) : (
        <>
          {online.length > 0 && (
            <section className="mb-10">
              <SectionTitle title={t('onlineNow')} />
              <CamGrid>
                {online.map((m) => (
                  <CamModelCard key={m.id} model={m} />
                ))}
              </CamGrid>
            </section>
          )}
          {offline.length > 0 && (
            <section>
              <SectionTitle title={tLive('offline')} />
              <div className="opacity-70">
                <CamGrid>
                  {offline.map((m) => (
                    <CamModelCard key={m.id} model={m} live={false} />
                  ))}
                </CamGrid>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
