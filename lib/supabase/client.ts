// Browser Supabase client. Uses the publishable (anon) key; RLS is the real
// access boundary. @supabase/ssr memoises this, so repeated calls share one
// GoTrue instance.
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
