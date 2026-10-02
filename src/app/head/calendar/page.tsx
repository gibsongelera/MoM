import { createClient } from '@/lib/supabase/server';
import MonthGrid, { type CalendarEvent } from '@/components/dashboard/MonthGrid';
import { parseMonthParam } from '@/lib/utils/month';

export default async function HeadCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const { year, month } = parseMonthParam(monthParam);
  const rangeStart = new Date(year, month, 1).toISOString();
  const rangeEnd = new Date(year, month + 1, 1).toISOString();

  const supabase = await createClient();
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, starts_at, meeting_type')
    .gte('starts_at', rangeStart)
    .lt('starts_at', rangeEnd);

  const events: CalendarEvent[] = (meetings ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    date: new Date(m.starts_at),
    tone: m.meeting_type,
    href: `/head/approvals?m=${m.id}`,
  }));

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Calendar</h1>
        <p className="font-body-lg text-on-surface-variant">Department meetings, color-coded by type.</p>
      </header>
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <MonthGrid year={year} month={month} events={events} basePath="/head/calendar" />
      </div>
    </>
  );
}
