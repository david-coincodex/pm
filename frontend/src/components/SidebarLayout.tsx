import { ReactNode } from 'react';

interface SidebarLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  header?: ReactNode;
  className?: string;
  /** When true, main content appears on the left and sidebar on the right. */
  reversed?: boolean;
}

export default function SidebarLayout({ sidebar, children, header, className = '', reversed = false }: SidebarLayoutProps) {
  const gridCols = reversed ? 'lg:grid-cols-[1fr_400px]' : 'lg:grid-cols-[400px_1fr]';
  return (
    <div className={`flex flex-col md:gap-8 lg:grid ${gridCols} lg:items-start lg:gap-10 ${className}`}>
      {/* Header spans full width on mobile (shown first), hidden inside the grid on lg where it lives in main */}
      {header && (
        <div className="lg:hidden">{header}</div>
      )}
      <aside className={`shrink-0 lg:sticky lg:top-24 ${reversed ? 'lg:order-2' : ''}`}>{sidebar}</aside>
      <main className={reversed ? 'lg:order-1' : ''}>
        {header && <div className="hidden lg:block">{header}</div>}
        {children}
      </main>
    </div>
  );
}
