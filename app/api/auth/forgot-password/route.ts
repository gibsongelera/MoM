import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMail, resetEmailHtml } from '@/lib/mailer';

export const runtime = 'nodejs';

// Password reset. Prefer Brevo HTTP when BREVO_API_KEY is set. If Brevo
// rejects the request (unauthorized IP, unverified sender, …), fall back to
// Supabase Auth's Recovery email, which uses dashboard custom SMTP.
const Body = z.object({ email: z.string().email() });

function siteOrigin(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  ).replace(/\/$/, '');
}

export async function POST(req: NextRequest) {
  let email: string;
  try {
    email = Body.parse(await req.json()).email.trim().toLowerCase();
  } catch {
    return NextResponse.json({ ok: true, sent: false });
  }

  const siteUrl = siteOrigin(req);

  if (process.env.BREVO_API_KEY) {
    const brevo = await tryBrevo(email, siteUrl);
    if (brevo.kind === 'ok') return NextResponse.json({ ok: true, sent: brevo.sent, reason: brevo.reason });
    console.warn('forgot-password: Brevo failed, falling back to Supabase SMTP:', brevo.error);
  }

  return sendViaSupabase(email, siteUrl);
}

async function tryBrevo(
  email: string,
  siteUrl: string,
): Promise<{ kind: 'ok'; sent: boolean; reason?: string } | { kind: 'fail'; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${siteUrl}/auth/reset-password` },
  });

  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) {
    return { kind: 'ok', sent: false, reason: 'no_account' };
  }

  const link = `${siteUrl}/auth/reset-password?token_hash=${hashed}&type=recovery`;
  const { data: prof } = await admin.from('profiles').select('name').eq('email', email).maybeSingle();

  try {
    await sendMail({
      to: email,
      subject: 'Reset your ZPPSU SmartMin password',
      html: resetEmailHtml(link, prof?.name || undefined),
    });
    return { kind: 'ok', sent: true };
  } catch (e) {
    return { kind: 'fail', error: e instanceof Error ? e.message : 'Email delivery failed.' };
  }
}

async function sendViaSupabase(email: string, siteUrl: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ ok: false, error: 'Supabase is not configured.' }, { status: 500 });
  }

  try {
    const admin = createAdminClient();
    const { data: prof } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    if (!prof) {
      return NextResponse.json({ ok: true, sent: false, reason: 'no_account' });
    }
  } catch {
    /* recover is anti-enumerating if lookup fails */
  }

  const recover = await fetch(`${supabaseUrl}/auth/v1/recover`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      redirect_to: `${siteUrl}/auth/reset-password`,
    }),
  });

  if (!recover.ok) {
    const detail = await recover.text().catch(() => '');
    return NextResponse.json(
      {
        ok: false,
        error:
          detail.slice(0, 240) ||
          `Supabase could not send the reset email (${recover.status}). Check Auth SMTP settings.`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, sent: true });
}
