import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { isoDaysAgo } from '@/lib/utils/datetime';
import { PERSONAL_COLUMNS, type PersonalMeeting } from '@/lib/personal/types';
import PersonalMeetingsManager from '@/components/personal/PersonalMeetingsManager';
import type { LinkableMeeting } from '@/components/personal/PersonalMeetingForm';

export const metadata: Metadata = { title: 'Personal Meetings | ZPPSU SmartMin' };

export default async function FacultyPersonalMeetingsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireRole('faculty');
  const { new: startNew } = await searchParams;
  const supabase = await createClient();
  const since = isoDaysAgo(180);
  const [rowsRes, meetingsRes] = await Promise.all([
    supabase.from('personal_meetings').select(PERSONAL_COLUMNS).eq('user_id', user.id).order('meeting_date', { ascending: false }).order('meeting_time', { ascending: false }),
    supabase.from('meetings').select('id, title, starts_at').gte('starts_at', since).order('starts_at', { ascending: false }).limit(80),
  ]);
  if (rowsRes.error) throw new Error(`Could not load your log: ${rowsRes.error.message}`);

  return (
    <PersonalMeetingsManager
      initial={(rowsRes.data as unknown as PersonalMeeting[]) ?? []}
      userId={user.id}
      linkable={(meetingsRes.data as LinkableMeeting[] | null) ?? []}
      startCreate={startNew === 'recording' ? 'recording' : startNew === 'log' ? 'log' : null}
    />
  );
}
