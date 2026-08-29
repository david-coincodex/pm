import { Link } from '@/i18n/navigation';
import { camCategoryPath } from '@/lib/cams/filters';
import type { CamCategory } from '@/lib/cams/categories';

/**
 * Category tag chips linking to their listing pages — the model page's tags and the listing
 * pages' related-categories row are the same element, defined once.
 */
export default function CamCategoryChips({ categories, className = '' }: { categories: CamCategory[]; className?: string }) {
  if (categories.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {categories.map((c) => (
        <Link
          key={c.slug}
          href={camCategoryPath(c)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 transition hover:border-emerald-400 hover:text-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-emerald-400"
        >
          {c.name}
        </Link>
      ))}
    </div>
  );
}
