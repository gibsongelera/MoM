import { createClient } from '@/lib/supabase/server';
import PersonalMeetingsManager from '@/components/dashboard/PersonalMeetingsManager';

export default async function FacultyPersonalMeetingsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('personal_meetings')
    .select('id, title, meeting_date, meeting_time, type, attendees, notes')
    .order('meeting_date', { ascending: false });

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Personal Meeting Log</h1>
        <p className="font-body-lg text-on-surface-variant">
          Advising sessions, consultations, and one-on-ones. Visible only to you (and administrators).
        </p>
      </header>
      <PersonalMeetingsManager initial={rows ?? []} />
    </>
  );
}
