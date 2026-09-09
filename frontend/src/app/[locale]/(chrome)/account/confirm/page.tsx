import { notFound, redirect } from 'next/navigation';
import { siteSettings } from '@/lib/siteSettings';

/**
 * BACK-COMPAT ONLY. Confirmation emails now link straight to `/api/auth/confirm-link`, which
 * redeems the token server-side and lands the visitor on the home page with the popup — real
 * content behind the card, and the token never in a page URL.
 *
 * This route survives because emails already in inboxes point here. It forwards the token to
 * that handler and renders nothing, so nobody sees the empty shell this page used to be.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string }>;
}) {
  if (!siteSettings.features.accounts) notFound();
  const { confirmation } = await searchParams;
  redirect(
    confirmation
      ? `/api/auth/confirm-link/?confirmation=${encodeURIComponent(confirmation)}`
      : '/?auth=login&error=invalid_code',
  );
}
