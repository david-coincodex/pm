import ImageGallery from '@/components/ImageGallery';
import type { StrapiMedia } from '@/lib/strapi';

interface SidebarLayoutHeaderProps {
  title: string;
  description?: string | null;
  gallery?: StrapiMedia[];
}

export default function SidebarLayoutHeader({ title, description, gallery }: SidebarLayoutHeaderProps) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
        {title}
      </h1>
      {description && (
        <p className="mt-1 hidden text-base text-slate-500 dark:text-slate-400 md:block">{description}</p>
      )}
      {gallery !== undefined && (
        <div className="mt-6">
          <ImageGallery images={gallery} />
        </div>
      )}
    </div>
  );
}
