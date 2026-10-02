/**
 * Emails meeting invitations / changes to participants who have accounts
 * (client: scheduled meetings must notify people; in-app + email).
 *
 * In-app notifications are raised by database triggers (0016) and do not
 * depend on this route. This one only adds email, so it is best-effort: the
 * meeting form calls it fire-and-forget, and without BREVO_API_KEY it reports
 * `skipped` instead of failing.
 *
 * Guards: active staff only; the caller must be able to edit the meeting
 * (checked through their own RLS-scoped client); recipients are limited to the
 * meeting's actual participants; one send per meeting+event per minute.
 */
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaff } from '@/lib/ai/guard';
import { emailConfigured, escapeHtml, sendMail } from '@/lib/mail/send';
import { notificationHref } from '@/lib/notifications/links';
import { fmtManila } from '@/lib/utils/datetime';
import type { UserRole } from '@/lib/types/domain';

export const runtime = 'nodejs';
export const maxDuration = 30;

const bodySchema = z.object({
  meetingId: z.string().uuid(),
  event: z.enum(['created', 'emergency', 'rescheduled', 'participants_added']),
  userIds: z.array(z.string().uuid()).max(200).optional(),
});

const RATE_WINDOW_MS = 60_000;
const lastSent = new Map<string, number>();

const SUBJECT: Record<z.infer<typeof bodySchema>['event'], string> = {
  created: "You're invited to a meeting",
  participants_added: "You're invited to a meeting",
  emergency: 'Emergency meeting now',
  rescheduled: 'Meeting rescheduled',
};

export async function POST(request: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { meetingId, event, userIds } = parsed.data;

  const supabase = await createClient();
  const { data: canEdit } = await supabase.rpc('sm_can_edit_meeting_docs', { p_meeting_id: meetingId });
  if (canEdit !== true) return NextResponse.json({ error: "You can't send updates for this meeting." }, { status: 403 });

  const key = `${meetingId}:${event}:${(userIds ?? []).slice().sort().join(',')}`;
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - RATE_WINDOW_MS) {
    return NextResponse.json({ emailed: 0, skipped: 0, reason: 'rate_limited' }, { status: 429 });
  }
  lastSent.set(key, now);

  const [{ data: meeting }, { data: participants }] = await Promise.all([
    supabase.from('meetings').select('id, title, starts_at, venue, is_emergency').eq('id', meetingId).maybeSingle(),
    supabase.from('meeting_participants').select('user_id').eq('meeting_id', meetingId),
  ]);
  if (!meeting) return NextResponse.json({ error: 'Meeting not found.' }, { status: 404 });

  const onMeeting = new Set((participants ?? []).map((p) => p.user_id as string));
  const recipients = (userIds ?? [...onMeeting]).filter((id) => onMeeting.has(id) && id !== staff.userId);
  if (recipients.length === 0) return NextResponse.json({ emailed: 0, skipped: 0 });
  if (!emailConfigured()) return NextResponse.json({ emailed: 0, skipped: recipients.length, reason: 'email_not_configured' });

  // Emails live on profiles; the service-role client is used only for this
  // lookup, after every authorisation check above has passed.
  const admin = createAdminClient();
  const { data: people } = await admin.from('profiles').select('id, name, email, role, active').in('id', recipients);

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const when = fmtManila(meeting.starts_at, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const subject = `${SUBJECT[event]}: ${meeting.title}`;

  const results = await Promise.allSettled(
    (people ?? [])
      .filter((p) => p.active && p.email)
      .map((p) => {
        const href = notificationHref(p.role as UserRole, 'meeting_invite', meeting.id);
        const link = appUrl && href ? `${appUrl}${href}` : null;
        const html = `
          <div style="font-family:Inter,Arial,sans-serif;color:#1a1c1c;max-width:560px">
            <p style="color:#570000;font-weight:700;margin:0 0 8px">ZPPSU SmartMin</p>
            <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(SUBJECT[event])}</h1>
            <p>Hello ${escapeHtml(p.name ?? '')},</p>
            <p><strong>${escapeHtml(meeting.title)}</strong><br/>
               ${escapeHtml(meeting.is_emergency ? 'Happening now' : when)}${meeting.venue ? `<br/>${escapeHtml(meeting.venue)}` : ''}</p>
            ${link ? `<p><a href="${escapeHtml(link)}" style="color:#570000;font-weight:600">Open in SmartMin</a></p>` : ''}
            <p style="color:#5a413d;font-size:12px">You're receiving this because you were added to this meeting in SmartMin.</p>
          </div>`;
        return sendMail({ to: p.email as string, subject, html });
      }),
  );
  const emailed = results.filter((r) => r.status === 'fulfilled').length;
  return NextResponse.json({ emailed, failed: results.length - emailed });
}
