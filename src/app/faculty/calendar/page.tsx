import { createClient } from '@/lib/supabase/server';
import MonthGrid, { type CalendarEvent } from '@/components/dashboard/MonthGrid';
import { parseMonthParam } from '@/lib/utils/month';

export default async function FacultyCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const { year, month } = parseMonthParam(monthParam);
  const rangeStart = new Date(year, month, 1);
  const rangeEnd = new Date(year, month + 1, 1);

  const supabase = await createClient();
  const [{ data: meetings }, { data: personal }] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, starts_at, meeting_type')
      .gte('starts_at', rangeStart.toISOString())
      .lt('starts_at', rangeEnd.toISOString()),
    supabase
      .from('personal_meetings')
      .select('id, title, meeting_date, meeting_time')
      .gte('meeting_date', rangeStart.toISOString().slice(0, 10))
      .lt('meeting_date', rangeEnd.toISOString().slice(0, 10)),
  ]);

  const events: CalendarEvent[] = [
    ...(meetings ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      date: new Date(m.starts_at),
      tone: m.meeting_type as CalendarEvent['tone'],
      href: `/faculty/transcript-view?m=${m.id}`,
    })),
    ...(personal ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      date: new Date(`${p.meeting_date}T${p.meeting_time || '00:00'}`),
      tone: 'personal' as const,
      href: '/faculty/personal-meetings',
    })),
  ];

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Calendar</h1>
        <p className="font-body-lg text-on-surface-variant">
          Your department meetings, plus your personal meeting log overlaid as dashed cards.
        </p>
      </header>
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <MonthGrid year={year} month={month} events={events} basePath="/faculty/calendar" />
      </div>
    </>
  );
}
