import Header from '@/components/Header';
import Breadcrumbs from '@/components/Breadcrumbs';
import Footer from '@/components/Footer';

export default function ChromeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <Breadcrumbs />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
