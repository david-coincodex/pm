import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { siteSettings } from '@/lib/siteSettings';

/** Current user for client components (the cookie is httpOnly — this is their only window). */
export async function GET() {
  if (!siteSettings.features.accounts) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const user = await getUser();
  return NextResponse.json({ user });
}
