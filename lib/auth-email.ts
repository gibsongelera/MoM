import { createAdminClient } from '@/lib/supabase/admin';
import { sendMail, confirmEmailHtml } from '@/lib/mailer';
import type { NextRequest } from 'next/server';

export function siteOrigin(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  ).replace(/\/$/, '');
}

/**
 * Emails a confirmation link for an existing (usually unconfirmed) auth user.
 * Tries Brevo HTTP first; on failure asks GoTrue to send the Confirm signup
 * template through dashboard SMTP.
 */
export async function sendEmailConfirmation(opts: {
  email: string;
  name?: string | null;
  siteUrl: string;
}): Promise<{ sent: boolean; error?: string }> {
  const { email, name, siteUrl } = opts;
  const confirmPath = `${siteUrl}/auth/confirm`;
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: confirmPath },
  });

  const hashed = data?.properties?.hashed_token;
  if (!error && hashed) {
    const link = `${confirmPath}?token_hash=${hashed}&type=magiclink`;
    try {
      await sendMail({
        to: email,
        subject: 'Confirm your ZPPSU SmartMin email',
        html: confirmEmailHtml(link, name || undefined),
      });
      return { sent: true };
    } catch (e) {
      console.warn('sendEmailConfirmation: Brevo failed, falling back to Supabase SMTP', e);
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) {
    return { sent: false, error: 'Could not send the confirmation email.' };
  }

  const resend = await fetch(`${supabaseUrl}/auth/v1/resend`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'signup',
      email,
      options: { emailRedirectTo: confirmPath },
    }),
  });

  if (!resend.ok) {
    const detail = await resend.text().catch(() => '');
    return {
      sent: false,
      error: detail.slice(0, 240) || `Could not send the confirmation email (${resend.status}).`,
    };
  }

  return { sent: true };
}
