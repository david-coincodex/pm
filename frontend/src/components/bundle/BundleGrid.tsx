import type { Bundle } from '@/lib/strapi';
import BundleCard from './BundleCard';

interface BundleGridProps {
  bundles: Bundle[];
  locale?: string;
  emptyMessage?: string;
}

export default function BundleGrid({ bundles, locale = 'en', emptyMessage = 'No bundles found.' }: BundleGridProps) {
  if (bundles.length === 0) {
    return <p className="text-slate-500 dark:text-slate-400">{emptyMessage}</p>;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {bundles.map((bundle) => (
        <BundleCard key={bundle.id} bundle={bundle} locale={locale} />
      ))}
    </div>
  );
}
