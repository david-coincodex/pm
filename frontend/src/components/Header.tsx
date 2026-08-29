import { getActiveSale } from '@/lib/strapi';
import NavMenu from './NavMenu';

export default async function Header() {
  const activeSale = await getActiveSale();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      {/* Full width (edge padding only): the nav frames full-width pages like /live-sex/,
          and a max-w-7xl bar over a wider body read as misaligned. */}
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <NavMenu activeSale={activeSale ? { slug: activeSale.slug, navLabel: activeSale.navLabel, themeColor: activeSale.themeColor } : null} />
      </div>
    </header>
  );
}
