import { ReactNode } from 'react';

interface ContainerProps {
  children: ReactNode;
  className?: string;
  /**
   * Apply the standard page-section vertical padding (less on top, more on bottom; reduced
   * further on mobile). Default true. Set false inside band sections, the header, breadcrumbs,
   * hero pages, etc. — or pass custom py/pt/pb via `className` (with `padded={false}`) to override.
   */
  padded?: boolean;
}

export default function Container({ children, className = '', padded = true }: ContainerProps) {
  const padding = padded ? 'pt-6 pb-10 lg:pt-12 lg:pb-14' : '';
  return (
    <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${padding} ${className}`}>
      {children}
    </div>
  );
}
