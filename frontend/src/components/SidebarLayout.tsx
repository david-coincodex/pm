import { ReactNode } from 'react';

interface SidebarLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function SidebarLayout({ sidebar, children, className = '' }: SidebarLayoutProps) {
  return (
    <div className={`flex flex-col gap-8 lg:grid lg:grid-cols-[400px_1fr] lg:items-start lg:gap-10 ${className}`}>
      <aside className="shrink-0 lg:sticky lg:top-24">{sidebar}</aside>
      <main>{children}</main>
    </div>
  );
}
