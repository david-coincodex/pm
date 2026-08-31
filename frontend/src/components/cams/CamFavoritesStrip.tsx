'use client';

import { useEffect, useState } from 'react';
import { useFavorites } from '@/hooks/useFavorites';
import { CAM_PROVIDER_NAMES, isCamProvider, type CamProvider } from '@/lib/cams/types';
import { routes } from '@/lib/routes';
import { Link } from '@/i18n/navigation';
import CamModelCardFrame from './CamModelCardFrame';
import CamThumbFallback from './CamThumbFallback';
import SectionTitle from '@/components/SectionTitle';
import { siteSettings } from '@/lib/siteSettings';

type OnlineFavorite = {
  id: string;
  provider: CamProvider;
  username: string;
  displayName: string;
  thumbUrl: string;
  viewers: number;
};

/**
 * "Your favorites — online now", rendered on the client on purpose.
 *
 * The listing pages around it are one shared, statically cached document; this strip is the
 * only part that differs per visitor. Fetching it after hydration keeps the page itself free
 * of cookies — which is what allows it to be served from the route cache at all — and costs
 * one small request that only logged-in users with favorites ever make.
 */
/** Flag gate as a hook-free wrapper: an early return above hooks would break hooks rules. */
export default function CamFavoritesStrip({ title }: { title: string }) {
  // Accounts disabled for launch: the strip has nothing to show (docs/enable-accounts.md).
  if (!siteSettings.features.accounts) return null;
  return <CamFavoritesStripInner title={title} />;
}

function CamFavoritesStripInner({ title }: { title: string }) {
  const { loaded, loggedIn, favorites } = useFavorites();
  const [models, setModels] = useState<OnlineFavorite[] | null>(null);

  const ids = favorites
    .filter((f) => isCamProvider(f.provider))
    .map((f) => `${f.provider}:${f.username}`)
    .join(',');

  useEffect(() => {
    if (!ids) return; // nothing favorited — `online` below resolves to [] without a fetch
    let cancelled = false;
    fetch(`/api/cams/online/?ids=${encodeURIComponent(ids)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setModels(d.models ?? []);
      })
      .catch(() => {
        if (!cancelled) setModels([]); // a strip that fails simply isn't there
      });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  // Derived rather than stored: with no ids there is nothing to fetch, so the empty result is
  // a fact about the input, not a piece of state an effect has to write.
  const online = ids ? models : [];

  // Logged out, nothing favorited, or still resolving who is online: render nothing at all —
  // no skeletons (removed pending the custom placeholder system), no empty heading.
  if (!loaded || !loggedIn || favorites.length === 0) return null;
  if (online === null || online.length === 0) return null;

  return (
    <section className="mt-5">
      <SectionTitle title={title} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {online.slice(0, 8).map((m) => (
              <CamModelCardFrame
                key={m.id}
                media={
                  <>
                    <CamThumbFallback displayName={m.displayName} />
                    {m.thumbUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={m.thumbUrl}
                        alt={m.displayName}
                        loading="lazy"
                        decoding="async"
                        data-cam-thumb=""
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 data-[broken]:opacity-0"
                      />
                    )}
                  </>
                }
                name={<span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{m.displayName}</span>}
                badge={
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                    {CAM_PROVIDER_NAMES[m.provider] ?? m.provider}
                  </span>
                }
                overlay={
                  <Link
                    href={routes.camModel(m.provider, m.username)}
                    aria-label={m.displayName}
                    className="absolute inset-0"
                  />
                }
              />
            ))}
      </div>
    </section>
  );
}
