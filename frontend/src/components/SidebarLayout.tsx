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
      {/* Reversed (sidebar-right) layouts drop the sidebar below the content on mobile.
          Base has no container gap, so add the standard mobile gap (mt-10) and reset it at
          md+ where the container's md:gap-8 / lg:gap-10 takes over. */}
      <aside className={`shrink-0 lg:sticky lg:top-24 ${reversed ? 'order-last mt-10 md:mt-0 lg:order-2' : ''}`}>{sidebar}</aside>
      {/* div, not <main>: the chrome layout already provides the page's single main landmark */}
      <div className={reversed ? 'lg:order-1' : ''}>
        {header && <div className="hidden lg:block">{header}</div>}
        {children}
      </div>
    </div>
  );
}
