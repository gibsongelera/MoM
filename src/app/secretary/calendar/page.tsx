import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import MonthGrid, { type CalendarEvent } from '@/components/dashboard/MonthGrid';
import { parseMonthParam } from '@/lib/utils/month';
import { manilaMonthRange } from '@/lib/utils/datetime';

export const metadata: Metadata = { title: 'Calendar | ZPPSU SmartMin' };

export default async function SecretaryCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const { year, month } = parseMonthParam(monthParam);
  const range = manilaMonthRange(year, month);

  const supabase = await createClient();
  const [{ data: meetings }] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, starts_at, meeting_type, is_emergency')
      .gte('starts_at', range.start)
      .lt('starts_at', range.end),
  ]);

  const events: CalendarEvent[] = [
    ...(meetings ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      startsAt: m.starts_at,
      tone: (m.is_emergency ? 'emergency' : m.meeting_type) as CalendarEvent['tone'],
      href: `/secretary/meetings/${m.id}`,
    })),
  ];

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Calendar</h1>
        <p className="font-body-lg text-on-surface-variant">Every scheduled and emergency meeting in your department, shown automatically.</p>
      </header>
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <MonthGrid year={year} month={month} events={events} basePath="/secretary/calendar" />
      </div>
    </>
  );
}
