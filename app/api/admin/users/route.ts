import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// Admin user management. Creating/deleting accounts and setting passwords needs
// the service role, so this route verifies the CALLER is an admin (via their
// session) before using the admin client. RLS still governs the profiles reads.
async function requireAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', uid).single();
  return profile?.role === 'admin' ? uid : null;
}

const CreateBody = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  position: z.string().optional().default(''),
  role: z.enum(['admin', 'head', 'secretary', 'faculty']),
  departmentId: z.string().min(1),
  password: z.string().min(6),
  active: z.boolean().optional().default(true),
});

const PatchBody = z.object({
  id: z.string().uuid(),
  name: z.string().optional(),
  position: z.string().optional(),
  role: z.enum(['admin', 'head', 'secretary', 'faculty']).optional(),
  departmentId: z.string().optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body;
  try {
    body = CreateBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: body.email.trim().toLowerCase(),
    password: body.password,
    email_confirm: true,
    user_metadata: { name: body.name, role: body.role, department_id: body.departmentId, position: body.position, active: body.active },
  });
  if (error) {
    const already = /already/i.test(error.message);
    return NextResponse.json({ error: already ? 'An account with this email already exists.' : error.message }, { status: already ? 409 : 400 });
  }
  await admin.from('profiles').update({
    name: body.name,
    position: body.position,
    department_id: body.departmentId,
    active: body.active,
    role: body.role,
  }).eq('id', data.user.id);
  return NextResponse.json({ ok: true, id: data.user.id });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body;
  try {
    body = PatchBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }
  const admin = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.position !== undefined) patch.position = body.position;
  if (body.role !== undefined) patch.role = body.role;
  if (body.departmentId !== undefined) patch.department_id = body.departmentId || null;
  if (body.active !== undefined) patch.active = body.active;
  if (Object.keys(patch).length) {
    const { error } = await admin.from('profiles').update(patch).eq('id', body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (body.password) {
    const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
  const admin = createAdminClient();
  // Deleting the auth user cascades to the profile (profiles.id FK on delete cascade).
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
