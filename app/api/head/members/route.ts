import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const MAX_SECRETARIES = 2;

// A head manages members of their OWN department. Creating accounts / setting
// passwords needs the service role, and heads can't update other profiles under
// RLS, so this route verifies the caller is a head and pins every write to the
// caller's department and to the faculty/secretary roles.
async function requireHead() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return null;
  const { data: profile } = await supabase.from('profiles').select('role, department_id').eq('id', uid).single();
  if (profile?.role !== 'head' || !profile.department_id) return null;
  return { id: uid, departmentId: profile.department_id as string };
}

async function secretaryCount(admin: ReturnType<typeof createAdminClient>, deptId: string, excludeId?: string) {
  let q = admin.from('profiles').select('id', { count: 'exact', head: true }).eq('department_id', deptId).eq('role', 'secretary');
  if (excludeId) q = q.neq('id', excludeId);
  const { count } = await q;
  return count ?? 0;
}

const CreateBody = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  position: z.string().optional().default(''),
  role: z.enum(['faculty', 'secretary']),
  password: z.string().min(6).optional(),
});

const PatchBody = z.object({
  id: z.string().uuid(),
  name: z.string().optional(),
  position: z.string().optional(),
  role: z.enum(['faculty', 'secretary']).optional(),
  password: z.string().min(6).optional(),
});

export async function POST(req: NextRequest) {
  const head = await requireHead();
  if (!head) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body;
  try {
    body = CreateBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }
  const admin = createAdminClient();
  if (body.role === 'secretary' && (await secretaryCount(admin, head.departmentId)) >= MAX_SECRETARIES) {
    return NextResponse.json({ error: `A department may have at most ${MAX_SECRETARIES} secretaries.` }, { status: 409 });
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: body.email.trim().toLowerCase(),
    password: body.password || 'changeme123',
    email_confirm: true,
    user_metadata: { name: body.name, role: body.role, department_id: head.departmentId, position: body.position, active: true },
  });
  if (error) {
    const already = /already/i.test(error.message);
    return NextResponse.json({ error: already ? 'An account with this email already exists.' : error.message }, { status: already ? 409 : 400 });
  }
  await admin.from('profiles').update({
    name: body.name,
    position: body.position,
    department_id: head.departmentId,
    role: body.role,
    active: true,
  }).eq('id', data.user.id);
  return NextResponse.json({ ok: true, id: data.user.id });
}

export async function PATCH(req: NextRequest) {
  const head = await requireHead();
  if (!head) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body;
  try {
    body = PatchBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }
  const admin = createAdminClient();
  // Target must be in the caller's department and not a head.
  const { data: target } = await admin.from('profiles').select('role, department_id').eq('id', body.id).single();
  if (!target || target.department_id !== head.departmentId || target.role === 'head') {
    return NextResponse.json({ error: 'Not permitted to edit this member.' }, { status: 403 });
  }
  if (body.role === 'secretary' && (await secretaryCount(admin, head.departmentId, body.id)) >= MAX_SECRETARIES) {
    return NextResponse.json({ error: `A department may have at most ${MAX_SECRETARIES} secretaries.` }, { status: 409 });
  }
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.position !== undefined) patch.position = body.position;
  if (body.role !== undefined) patch.role = body.role;
  if (Object.keys(patch).length) await admin.from('profiles').update(patch).eq('id', body.id);
  if (body.password) {
    const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
