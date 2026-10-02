'use client';

// Month calendar widget — React port of assets/js/calendar.js.

import { useState } from 'react';
import { fmtDate } from '@/lib/utils';
import type { Meeting, PersonalMeeting } from '@/lib/types';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type CalEvent =
  | ({ kind: 'meeting' } & Meeting)
  | ({ kind: 'personal' } & PersonalMeeting);

export function flattenEvents(meetings: Meeting[], personal: PersonalMeeting[] = []): CalEvent[] {
  return [
    ...meetings.map((m) => ({ kind: 'meeting' as const, ...m })),
    ...personal.map((p) => ({ kind: 'personal' as const, ...p })),
  ];
}

function eventDate(ev: CalEvent): Date {
  if (ev.kind === 'personal') return new Date(`${ev.date}T${ev.time || '00:00'}`);
  return new Date(ev.date);
}
function colorClass(ev: CalEvent): string {
  if (ev.kind === 'personal') return 'personal';
  if (ev.meetingType === 'capstone') return 'capstone';
  if (ev.meetingType === 'research') return 'research';
  return 'regular';
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function Calendar({
  events,
  onEventClick,
}: {
  events: CalEvent[];
  onEventClick?: (ev: CalEvent) => void;
}) {
  const [current, setCurrent] = useState(() => new Date());
  const [detailDay, setDetailDay] = useState<Date | null>(null);

  const first = new Date(current.getFullYear(), current.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    return { day, events: events.filter((ev) => sameDay(eventDate(ev), day)) };
  });
  const today = new Date();
  const detailEvents = detailDay ? events.filter((ev) => sameDay(eventDate(ev), detailDay)) : [];

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
      <div className="flex items-center justify-between mb-md flex-wrap gap-sm">
        <div className="flex items-center gap-sm">
          <button onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="px-sm py-xs rounded-lg border border-outline-variant hover:bg-surface-container-low">
            <span className="material-symbols-outlined text-[18px] align-middle">chevron_left</span>
          </button>
          <button onClick={() => setCurrent(new Date())} className="px-sm py-xs rounded-lg border border-outline-variant hover:bg-surface-container-low">
            Today
          </button>
          <button onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="px-sm py-xs rounded-lg border border-outline-variant hover:bg-surface-container-low">
            <span className="material-symbols-outlined text-[18px] align-middle">chevron_right</span>
          </button>
          <h3 className="font-h3 text-h3 ml-sm">
            {MONTH_NAMES[current.getMonth()]} {current.getFullYear()}
          </h3>
        </div>
        <div className="flex items-center gap-md text-caption font-caption text-on-surface-variant flex-wrap">
          <span className="flex items-center gap-xs"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(87,0,0,0.40)' }} /> Regular</span>
          <span className="flex items-center gap-xs"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(203,167,47,0.65)' }} /> Capstone</span>
          <span className="flex items-center gap-xs"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(46,125,50,0.40)' }} /> Research</span>
          <span className="flex items-center gap-xs"><span className="inline-block w-3 h-3 rounded-sm border border-dashed" /> Personal</span>
        </div>
      </div>

      <div className="cal-grid">
        {WEEK_SHORT.map((w) => (
          <div key={w} className="cal-head">
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          const muted = c.day.getMonth() !== current.getMonth();
          const isToday = sameDay(c.day, today);
          return (
            <div
              key={i}
              className={`cal-cell ${muted ? 'muted' : ''} ${isToday ? 'today' : ''}`}
              onClick={() => setDetailDay(c.day)}
            >
              <span className="cal-daynum">{c.day.getDate()}</span>
              {c.events.slice(0, 3).map((ev, j) => (
                <span
                  key={j}
                  className={`cal-event ${colorClass(ev)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick?.(ev);
                  }}
                >
                  {(ev.kind === 'meeting' ? ev.title || ev.projectTitle : ev.title) || 'Untitled'}
                </span>
              ))}
              {c.events.length > 3 ? <span className="cal-more">+{c.events.length - 3} more</span> : null}
            </div>
          );
        })}
      </div>

      <div className="mt-md">
        {detailDay ? (
          detailEvents.length === 0 ? (
            <div className="border border-dashed border-outline-variant rounded-lg p-md text-on-surface-variant text-body-sm">
              No events on {detailDay.toDateString()}.
            </div>
          ) : (
            <>
              <h4 className="font-body-md font-semibold mb-sm">{detailDay.toDateString()}</h4>
              <div className="space-y-sm">
                {detailEvents.map((ev) => {
                  const t = colorClass(ev);
                  const time = ev.kind === 'personal' ? ev.time || '' : fmtDate(ev.date, true).split(',').slice(-1)[0].trim();
                  const venue = ev.kind === 'personal' ? ev.type || 'Personal' : ev.venue || '';
                  const title = ev.kind === 'meeting' ? ev.title || ev.projectTitle : ev.title;
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onEventClick?.(ev)}
                      className="w-full text-left p-sm rounded-lg border border-outline-variant hover:bg-surface-container-low transition-colors"
                    >
                      <div className="flex items-center gap-sm">
                        <span className={`cal-event ${t}`} style={{ fontSize: '10px' }}>
                          {t.toUpperCase()}
                        </span>
                        <p className="font-body-sm font-semibold truncate flex-1">{title || 'Untitled'}</p>
                        <span className="font-caption text-caption text-on-surface-variant">{time}</span>
                      </div>
                      <p className="font-caption text-caption text-on-surface-variant ml-[60px]">{venue}</p>
                    </button>
                  );
                })}
              </div>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}
