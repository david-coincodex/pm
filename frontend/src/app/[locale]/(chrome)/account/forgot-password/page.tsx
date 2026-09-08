import { notFound, redirect } from 'next/navigation';
import { siteSettings } from '@/lib/siteSettings';

/**
 * Kept for direct links and bookmarks, but it no longer renders a popup over an empty page:
 * asking for a reset link is a popup mode, so this just opens it on the home page.
 */
export default async function ForgotPasswordPage() {
  if (!siteSettings.features.accounts) notFound();
  redirect('/?auth=forgot');
}
