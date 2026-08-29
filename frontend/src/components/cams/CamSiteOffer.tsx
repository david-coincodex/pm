import { getActiveSale, type Site } from '@/lib/strapi';
import { getTranslations } from 'next-intl/server';
import SidebarSiteCard from '@/components/SidebarSiteCard';

/**
 * The cam site's own deal on model pages — the SAME sidebar card every other page's deals
 * column renders (SidebarSiteCard), just for the one site the model streams on. The room
 * embed monetizes the room; this monetizes the PLATFORM.
 *
 * The site comes from the provider's cam-category (`site` relation, editor-linked in Strapi).
 * Providers whose category has no linked site render nothing — so this degrades silently
 * until the content team links one.
 */
export default async function CamSiteOffer({ site }: { site: Site | null }) {
  if (!site || !site.isActive) return null;
  const activeOffers = (site.offers ?? []).filter((o) => o.isActive);
  if (activeOffers.length === 0) return null;
  const [activeSale, t] = await Promise.all([getActiveSale(), getTranslations('liveSex')]);

  return (
    <section className="flex flex-col gap-3">
      {/* Same heading CHROME as the deals column, but a <p>: this sidebar renders before the
          page's H1 in DOM order, and a leading h2 would break the document's heading outline
          (same reasoning as the rail's Categories label). */}
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {t('streamingOn')}
      </p>
      <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <SidebarSiteCard
          site={site}
          saleBadge={activeSale?.siteIds.includes(site.id) ? activeSale : null}
          liveBadge
          layout="stacked"
        />
      </ul>
    </section>
  );
}
