'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { Calendar, flattenEvents } from '@/components/Calendar';
import { useData } from '@/components/DataProvider';
import { scopeMeetings } from '@/lib/scope';

export default function HeadCalendar() {
  const { user, ready } = useRequireRole('head');
  usePageTitle('Calendar');
  const router = useRouter();
  const { meetings: allMeetings, ready: dataReady } = useData();

  const events = useMemo(() => {
    if (!user) return [];
    return flattenEvents(scopeMeetings(user, allMeetings), []);
  }, [user, allMeetings]);

  if (!ready || !user || !dataReady) return null;

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1 flex items-center gap-sm">
          <span className="material-symbols-outlined text-primary text-[36px]">calendar_month</span> Calendar
        </h1>
        <p className="font-body-md text-on-surface-variant">Department meetings across the term, color-coded by type.</p>
      </header>

      <Calendar
        events={events}
        onEventClick={(ev) => {
          if (ev.kind === 'meeting') router.push(`/head/approvals?m=${ev.id}`);
        }}
      />
    </div>
  );
}
