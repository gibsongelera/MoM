import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import MonthGrid, { type CalendarEvent } from '@/components/dashboard/MonthGrid';
import { parseMonthParam } from '@/lib/utils/month';
import { manilaMonthRange } from '@/lib/utils/datetime';

export const metadata: Metadata = { title: 'Calendar | ZPPSU SmartMin' };

export default async function FacultyCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const { year, month } = parseMonthParam(monthParam);
  const range = manilaMonthRange(year, month);
  // personal_meetings stores plain calendar dates, so bound them by date strings.
  const pad = (n: number) => String(n).padStart(2, '0');
  const firstDay = `${year}-${pad(month + 1)}-01`;
  const nextFirstDay = month === 11 ? `${year + 1}-01-01` : `${year}-${pad(month + 2)}-01`;

  const supabase = await createClient();
  const [{ data: meetings }, { data: personal }] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, starts_at, meeting_type, is_emergency')
      .gte('starts_at', range.start)
      .lt('starts_at', range.end),
    supabase
      .from('personal_meetings')
      .select('id, title, meeting_date, meeting_time')
      .gte('meeting_date', firstDay)
      .lt('meeting_date', nextFirstDay),
  ]);

  const events: CalendarEvent[] = [
    ...(meetings ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      startsAt: m.starts_at,
      tone: (m.is_emergency ? 'emergency' : m.meeting_type) as CalendarEvent['tone'],
      href: `/faculty/my-meetings/${m.id}`,
    })),
    ...(personal ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      startsAt: new Date(`${p.meeting_date}T${(p.meeting_time || '00:00').slice(0, 5)}:00+08:00`).toISOString(),
      tone: 'personal' as const,
      href: '/faculty/personal-meetings',
      allDay: !p.meeting_time,
    })),
  ];

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Calendar</h1>
        <p className="font-body-lg text-on-surface-variant">Your department&apos;s meetings and the ones you&apos;re invited to, plus your personal log (dashed).</p>
      </header>
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <MonthGrid year={year} month={month} events={events} basePath="/faculty/calendar" />
      </div>
    </>
  );
}
