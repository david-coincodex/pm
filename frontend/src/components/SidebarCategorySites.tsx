import { getTranslations } from 'next-intl/server';
import { getSitesByCategoryId, getSitesBySiteType, getActiveSale, type Site } from '@/lib/strapi';
import { siteSettings } from '@/lib/siteSettings';
import SidebarSiteCard from '@/components/SidebarSiteCard';

interface SidebarCategorySitesProps {
  /** Optional override; defaults to the translated "Live Sex Deals" heading. */
  title?: string;
  limit?: number;
  categoryId?: number;
  siteType?: Site['siteType'];
}

export default async function SidebarCategorySites({ title, limit = 5, categoryId, siteType }: SidebarCategorySitesProps) {
  const sitesPromise = siteType
    ? getSitesBySiteType(siteType, limit)
    : categoryId !== undefined
      ? getSitesByCategoryId(categoryId, 1, limit).then((r) => r.sites)
      : Promise.resolve([] as Site[]);

  const [sites, activeSale, tSites] = await Promise.all([
    sitesPromise,
    getActiveSale(),
    getTranslations('sites'),
  ]);

  if (!Array.isArray(sites) || sites.length === 0) return null;

  const displayTitle = title ?? tSites('liveSexDeals');

  const isInCamCategory = categoryId === siteSettings.CAM_CATEGORY_ID;

  return (
    <aside className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {displayTitle}
      </h2>
      <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700/60 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 overflow-hidden">
        {sites.map((site) => (
          <SidebarSiteCard
            key={site.id}
            site={site}
            saleBadge={activeSale?.siteIds.includes(site.id) ? activeSale : null}
            liveBadge={isInCamCategory || siteType === 'camsite'}
          />
        ))}
      </ul>
    </aside>
  );
}
