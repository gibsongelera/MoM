import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Exchanges the `code` from a Supabase email link (confirmation / recovery)
// for a session, then forwards to `next`.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/login?verified=1';
  const dest = next.startsWith('/') ? next : `/${next}`;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Confirmation should not leave them signed in; they use the login form.
      if (dest.startsWith('/login')) {
        await supabase.auth.signOut();
      }
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }
  return NextResponse.redirect(`${origin}/login`);
}
