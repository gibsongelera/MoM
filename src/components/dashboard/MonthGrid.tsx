import Link from 'next/link';
import { fmtManilaTime, manilaDateKey } from '@/lib/utils/datetime';
import { Icon } from '@/components/ui/Icon';

export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO timestamp; bucketed onto the Manila calendar day. */
  startsAt: string;
  tone: 'regular' | 'capstone' | 'research' | 'personal' | 'emergency';
  href?: string;
  /** Hide the time (e.g. personal entries without one). */
  allDay?: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const VISIBLE_PER_DAY = 3;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Server-rendered month grid (port of the .cal-grid/.cal-cell/.cal-event
 * classes). Days are Manila calendar days, so an early-morning meeting never
 * lands on the previous day when the server runs in UTC. Month navigation is
 * plain links (`?month=`), so no client JS is needed; extra events on a busy
 * day expand with a native <details> (keyboard accessible, no fake "+N more").
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
  // Pure calendar arithmetic in UTC, independent of the server's zone.
  const startOffset = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayKey = manilaDateKey(new Date());

  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const key = manilaDateKey(e.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const next = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const navClass = 'flex h-9 min-w-9 items-center justify-center rounded-lg border border-outline-variant px-sm hover:bg-surface-container-low';

  function renderEvent(e: CalendarEvent) {
    const label = `${e.allDay ? '' : `${fmtManilaTime(e.startsAt)} `}${e.title}`;
    const content = (
      <>
        {e.tone === 'emergency' ? <Icon name="emergency" size={14} className="mr-[2px] inline-block align-[-2px]" /> : null}
        {label}
      </>
    );
    return e.href ? (
      <Link key={e.id} href={e.href} className={`cal-event block ${e.tone}`} title={label}>
        {content}
      </Link>
    ) : (
      <span key={e.id} className={`cal-event block ${e.tone}`} title={label}>
        {content}
      </span>
    );
  }

  return (
    <div>
      <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
        <h2 className="font-h3 text-h3">{monthLabel}</h2>
        <nav aria-label="Month" className="flex gap-sm">
          <Link href={`${basePath}?month=${prev.y}-${pad(prev.m + 1)}`} className={navClass} aria-label="Previous month">
            <Icon name="chevron_left" size={24} />
          </Link>
          <Link href={basePath} className={`${navClass} font-semibold text-body-sm`}>
            Today
          </Link>
          <Link href={`${basePath}?month=${next.y}-${pad(next.m + 1)}`} className={navClass} aria-label="Next month">
            <Icon name="chevron_right" size={24} />
          </Link>
        </nav>
      </div>

      <ul aria-label="Legend" className="mb-sm flex flex-wrap gap-xs font-caption text-caption">
        <li className="cal-event regular">Regular</li>
        <li className="cal-event capstone">Capstone</li>
        <li className="cal-event research">Research</li>
        <li className="cal-event emergency">Emergency</li>
      </ul>

      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-head" aria-hidden="true">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="cal-cell muted" aria-hidden="true" />;
          const key = `${year}-${pad(month + 1)}-${pad(day)}`;
          const isToday = key === todayKey;
          const dayEvents = byDay.get(key) ?? [];
          const visible = dayEvents.slice(0, VISIBLE_PER_DAY);
          const extra = dayEvents.slice(VISIBLE_PER_DAY);
          const dateLabel = new Date(Date.UTC(year, month, day)).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          });
          return (
            <section key={i} aria-label={`${dateLabel}${isToday ? ', today' : ''}, ${dayEvents.length} meetings`} className={`cal-cell ${isToday ? 'today' : ''}`}>
              <span className="cal-daynum" aria-hidden="true">
                {day}
              </span>
              {visible.map(renderEvent)}
              {extra.length ? (
                <details>
                  <summary className="cal-more cursor-pointer">+{extra.length} more</summary>
                  <div className="mt-xs flex flex-col gap-[4px]">{extra.map(renderEvent)}</div>
                </details>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
