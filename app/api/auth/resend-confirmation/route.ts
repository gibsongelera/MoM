import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmailConfirmation, siteOrigin } from '@/lib/auth-email';

export const runtime = 'nodejs';

const Body = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  let email: string;
  try {
    email = Body.parse(await req.json()).email.trim().toLowerCase();
  } catch {
    return NextResponse.json({ ok: true, sent: false });
  }

  const mailed = await sendEmailConfirmation({
    email,
    siteUrl: siteOrigin(req),
  });

  if (!mailed.sent) {
    return NextResponse.json(
      { ok: false, error: mailed.error || 'Could not send the confirmation email.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, sent: true });
}
