'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { strapiMediaUrl, type Site } from '@/lib/strapi';
import { routes } from '@/lib/routes';
import PopoverSheet from '@/components/PopoverSheet';

interface SubsiteGridProps {
  subsites: Site[];
  siteName: string;
  siteSlug: string;
}

function SubsiteTile({ subsite, siteSlug }: { subsite: Site; siteSlug: string }) {
  const image = subsite.logo ?? subsite.cover_image;
  return (
    <Link
      href={routes.subsite(siteSlug, subsite.slug)}
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-center transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-t-xl bg-slate-100 dark:bg-slate-700">
        {image ? (
          <Image
            src={strapiMediaUrl(image)}
            alt={image.alternativeText ?? subsite.name}
            fill
            sizes="(min-width: 768px) 20vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-400 dark:text-slate-500">
            {subsite.name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <span className="line-clamp-2 px-2 py-2 text-xs font-medium text-slate-700 dark:text-slate-300">
        {subsite.name}
      </span>
    </Link>
  );
}

export default function SubsiteGrid({ subsites, siteName, siteSlug }: SubsiteGridProps) {
  const t = useTranslations('sites');
  const active = subsites.filter((s) => s.isActive);

  if (active.length === 0) return null;

  const hasOverflow = active.length > 5;
  const visible = hasOverflow ? active.slice(0, 4) : active;
  const overflowCount = active.length - 4;

  const previewNames = active.slice(0, 3).map((s) => s.name).join(', ');

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-xl font-bold text-slate-900 dark:text-white">
        Unlock{' '}
        <span className="text-emerald-600 dark:text-emerald-400">{active.length}</span>{' '}
        Bonus Sites With This {siteName} Deal
      </h2>

      <p className="mb-5 text-base text-slate-600 dark:text-slate-300">
        {t('bonusSitesDescription', { siteName, count: active.length, siteList: previewNames })}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {visible.map((subsite) => (
          <SubsiteTile key={subsite.id} subsite={subsite} siteSlug={siteSlug} />
        ))}
        {hasOverflow && (
          <PopoverSheet
            title={`All ${active.length} Bonus Sites`}
            trigger={
              <button
                type="button"
                className="flex h-full min-h-[5rem] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                +{overflowCount}
              </button>
            }
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {active.map((subsite) => (
                <SubsiteTile key={subsite.id} subsite={subsite} siteSlug={siteSlug} />
              ))}
            </div>
          </PopoverSheet>
        )}
      </div>
    </div>
  );
}
