import Link from 'next/link';

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  tone: 'regular' | 'capstone' | 'research' | 'personal';
  href?: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Server-rendered month grid, port of the .cal-grid/.cal-cell/.cal-event
 * classes already in globals.css (from assets/js/calendar.js). Month
 * navigation is plain links with a different `?month=` value rather than
 * client-side state, so the component needs no 'use client' and no JS to
 * paginate.
 */
export default function MonthGrid({
  year,
  month,
  events,
  basePath,
}: {
  year: number;
  month: number; // 0-indexed
  events: CalendarEvent[];
  basePath: string;
}) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const nextMonth = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };
  const monthLabel = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="flex items-center justify-between mb-md">
        <h3 className="font-h3 text-h3">{monthLabel}</h3>
        <div className="flex gap-sm">
          <Link
            href={`${basePath}?month=${prevMonth.y}-${String(prevMonth.m + 1).padStart(2, '0')}`}
            className="p-xs rounded-lg border border-outline-variant hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </Link>
          <Link href={basePath} className="px-md py-xs rounded-lg border border-outline-variant hover:bg-surface-container-low font-label-caps text-label-caps">
            Today
          </Link>
          <Link
            href={`${basePath}?month=${nextMonth.y}-${String(nextMonth.m + 1).padStart(2, '0')}`}
            className="p-xs rounded-lg border border-outline-variant hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </Link>
        </div>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-head">
            {w}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="cal-cell muted" />;
          const isToday = sameDay(date, today);
          const dayEvents = events.filter((e) => sameDay(e.date, date));
          return (
            <div key={i} className={`cal-cell ${isToday ? 'today' : ''}`}>
              <span className="cal-daynum">{date.getDate()}</span>
              {dayEvents.slice(0, 3).map((e) =>
                e.href ? (
                  <Link key={e.id} href={e.href} className={`cal-event ${e.tone}`} title={e.title}>
                    {e.title}
                  </Link>
                ) : (
                  <span key={e.id} className={`cal-event ${e.tone}`} title={e.title}>
                    {e.title}
                  </span>
                ),
              )}
              {dayEvents.length > 3 ? <span className="cal-more">+{dayEvents.length - 3} more</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
