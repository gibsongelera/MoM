import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmailConfirmation, siteOrigin } from '@/lib/auth-email';

export const runtime = 'nodejs';

// Self-registration. Creates an UNCONFIRMED auth user so they must click the
// email link before sign-in. Admin sign-ups are also inactive until approved.
const Body = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  position: z.string().optional().default(''),
  role: z.enum(['admin', 'head', 'secretary', 'faculty']),
  departmentId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Please fill in all fields correctly.' }, { status: 400 });
  }

  const { name, email, password, position, role, departmentId } = parsed;
  const active = role !== 'admin';
  const admin = createAdminClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: false,
    user_metadata: { name, role, department_id: departmentId, position, active },
  });

  if (error) {
    const already = /already/i.test(error.message);
    return NextResponse.json(
      { error: already ? 'An account with this email already exists.' : error.message },
      { status: already ? 409 : 400 },
    );
  }

  await admin
    .from('profiles')
    .update({
      name,
      position,
      department_id: departmentId,
      active,
      role,
    })
    .eq('id', data.user.id);

  const mailed = await sendEmailConfirmation({
    email: normalizedEmail,
    name,
    siteUrl: siteOrigin(req),
  });

  if (!mailed.sent) {
    return NextResponse.json(
      {
        error:
          mailed.error ||
          'Account was created but the confirmation email could not be sent. Try Resend from the sign-in page.',
        emailSent: false,
        needsConfirmation: true,
        active,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    active,
    needsConfirmation: true,
    emailSent: true,
  });
}
