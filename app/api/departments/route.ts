import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// Public list of departments for the (unauthenticated) register dropdown.
// Names only — not sensitive. Reads via the admin client because RLS hides
// department rows from anonymous callers.
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('departments')
      .select('id, short, name, type')
      .order('short');
    if (error) throw error;
    return NextResponse.json({ departments: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load departments.' },
      { status: 500 },
    );
  }
}
