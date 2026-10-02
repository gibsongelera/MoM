import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { MEETING_COLUMNS, departmentHead, departmentPeople, meetingSubtypes } from '@/lib/meetings/queries';
import { startOfManilaDay } from '@/lib/utils/datetime';
import MeetingsView, { type MeetingListItem } from '@/components/meetings/MeetingsView';

export const metadata: Metadata = { title: 'Meetings | ZPPSU SmartMin' };

type Row = Omit<MeetingListItem, 'participantIds'> & { meeting_participants: { user_id: string }[] | null };

export default async function SecretaryMeetingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole('secretary');
  const params = await searchParams;
  const supabase = await createClient();

  if (!user.department_id) {
    return (
      <p role="alert" className="text-error">
        Your profile has no department yet. Ask an administrator to assign one before scheduling meetings.
      </p>
    );
  }

  const todayStart = startOfManilaDay().toISOString();
  const [upcomingRes, recentRes, people, head, subtypes] = await Promise.all([
    supabase.from('meetings').select(MEETING_COLUMNS).gte('starts_at', todayStart).order('starts_at').limit(60),
    supabase.from('meetings').select(MEETING_COLUMNS).lt('starts_at', todayStart).order('starts_at', { ascending: false }).limit(6),
    departmentPeople(supabase, user.department_id),
    departmentHead(supabase, user.department_id),
    meetingSubtypes(supabase),
  ]);

  if (upcomingRes.error || recentRes.error) {
    throw new Error(`Could not load meetings: ${(upcomingRes.error ?? recentRes.error)?.message}`);
  }

  const toItem = (r: Row): MeetingListItem => {
    const { meeting_participants, ...rest } = r;
    return { ...rest, participantIds: (meeting_participants ?? []).map((p) => p.user_id) };
  };

  return (
    <MeetingsView
      upcoming={((upcomingRes.data as unknown as Row[]) ?? []).map(toItem)}
      recent={((recentRes.data as unknown as Row[]) ?? []).map(toItem)}
      departmentId={user.department_id}
      currentUserId={user.id}
      head={head}
      people={people.filter((p) => p.id !== user.id)}
      subtypes={subtypes}
      startEmergency={params.emergency === '1'}
    />
  );
}
