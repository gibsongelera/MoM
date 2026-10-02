// Service-role Supabase client. Bypasses RLS entirely — server-only.
// Use ONLY where there is no user session to act as: the ElevenLabs webhook
// and the self-registration route (which must create an auth user + confirm
// it without a session). Never import this into client code.
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set for admin access.',
    );
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
