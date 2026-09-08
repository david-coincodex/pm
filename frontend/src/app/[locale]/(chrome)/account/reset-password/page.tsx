import { notFound, redirect } from 'next/navigation';
import { siteSettings } from '@/lib/siteSettings';

/**
 * BACK-COMPAT ONLY — see the confirm page. Reset emails now link to `/api/auth/reset-link`,
 * which parks the code in an httpOnly cookie and opens the popup on the home page, so the code
 * never reaches a page URL. Links already sent still work through here.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  if (!siteSettings.features.accounts) notFound();
  const { code } = await searchParams;
  redirect(code ? `/api/auth/reset-link/?code=${encodeURIComponent(code)}` : '/?auth=forgot&error=invalid_code');
}
