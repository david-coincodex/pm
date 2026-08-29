import type { ReactNode } from 'react';
import { routes } from '@/lib/routes';

interface Props {
  provider: string;
  username: string;
  className?: string;
  children: ReactNode;
}

/**
 * Outbound affiliate CTA. Points at the /out/model/ redirect so the click is counted
 * server-side (this audience blocks gtag — see /offer/, #14); the route resolves the real
 * affiliate URL and 302s.
 */
export default function CamCtaLink({ provider, username, className, children }: Props) {
  return (
    <a href={routes.camOut(provider, username)} target="_blank" rel="noopener noreferrer nofollow" className={className}>
      {children}
    </a>
  );
}
