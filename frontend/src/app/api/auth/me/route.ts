import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { accountsDisabled } from '@/lib/authApi';

/** Current user for client components (the cookie is httpOnly — this is their only window). */
export async function GET() {
  const disabled = accountsDisabled();
  if (disabled) return disabled;
  const user = await getUser();
  return NextResponse.json({ user });
}
