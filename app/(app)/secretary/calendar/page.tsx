'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { Calendar, flattenEvents } from '@/components/Calendar';
import { useData } from '@/components/DataProvider';
import { scopeMeetings } from '@/lib/scope';

export default function SecretaryCalendar() {
  const { user, ready } = useRequireRole('secretary');
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
      <header className="mb-lg flex flex-wrap items-end gap-sm justify-between">
        <div>
          <h1 className="font-h1 text-h1 flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary text-[36px]">calendar_month</span> Calendar
          </h1>
          <p className="font-body-md text-on-surface-variant">
            Department meetings color-coded by type. Click a day to inspect, or an event to open its record.
          </p>
        </div>
        <Link href="/secretary/schedule" className="bg-primary text-on-primary rounded-lg px-md py-sm font-label-caps text-label-caps shadow-primary-md hover:opacity-90 flex items-center gap-sm">
          <span className="material-symbols-outlined text-[18px]">add</span> Schedule Meeting
        </Link>
      </header>

      <Calendar
        events={events}
        onEventClick={(ev) => {
          if (ev.kind !== 'meeting') return;
          if (ev.status === 'scheduled') router.push(`/secretary/schedule?id=${ev.id}`);
          else router.push(`/secretary/mom-editor?m=${ev.id}`);
        }}
      />
    </div>
  );
}
