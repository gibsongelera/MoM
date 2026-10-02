/**
 * Service-role Supabase client. Bypasses RLS entirely.
 *
 * Use only where there is no Supabase user session to act as — today that
 * means the ElevenLabs/AssemblyAI webhooks, which are called by a third
 * party with no cookies and no auth.uid(). Never use this in a request
 * handler that serves an authenticated user directly; use
 * @/lib/supabase/server for that so RLS stays the actual access boundary.
 */
import 'server-only';
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
