'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { Calendar, flattenEvents } from '@/components/Calendar';
import { useData } from '@/components/DataProvider';
import { scopeMeetings, scopePersonalMeetings } from '@/lib/scope';

export default function FacultyCalendar() {
  const { user, ready } = useRequireRole('faculty');
  usePageTitle('Calendar');
  const router = useRouter();
  const { meetings: allMeetings, personalMeetings, ready: dataReady } = useData();

  const events = useMemo(() => {
    if (!user) return [];
    const meetings = scopeMeetings(user, allMeetings);
    const personal = scopePersonalMeetings(user, personalMeetings);
    return flattenEvents(meetings, personal);
  }, [user, allMeetings, personalMeetings]);

  if (!ready || !user || !dataReady) return null;

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1 flex items-center gap-sm">
          <span className="material-symbols-outlined text-primary text-[36px]">calendar_month</span> Calendar
        </h1>
        <p className="font-body-md text-on-surface-variant">
          Your meetings and personal advising sessions in one view. Personal logs appear dashed.
        </p>
      </header>

      <Calendar
        events={events}
        onEventClick={(ev) => {
          if (ev.kind === 'personal') router.push(`/faculty/personal-meetings?id=${ev.id}`);
          else router.push(`/faculty/my-meetings?m=${ev.id}`);
        }}
      />
    </div>
  );
}
