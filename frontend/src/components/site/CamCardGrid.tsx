import CamCard from './CamCard';
import { Site } from '@/lib/strapi';

interface CamCardGridProps {
  sites: Site[];
  currency?: string;
}

export default function CamCardGrid({ sites, currency }: CamCardGridProps) {
  if (sites.length === 0) return null;

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {sites.map((site) => (
        <CamCard key={site.id} site={site} currency={currency} />
      ))}
    </div>
  );
}
