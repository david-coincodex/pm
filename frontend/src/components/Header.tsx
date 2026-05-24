import { getActiveSale } from '@/lib/strapi';
import Container from './Container';
import NavMenu from './NavMenu';

export default async function Header() {
  const activeSale = await getActiveSale();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <Container>
        <NavMenu activeSale={activeSale ? { slug: activeSale.slug, navLabel: activeSale.navLabel, themeColor: activeSale.themeColor } : null} />
      </Container>
    </header>
  );
}
