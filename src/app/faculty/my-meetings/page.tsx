import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtManila, startOfManilaDay } from '@/lib/utils/datetime';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { EmergencyPill, MeetingStatusPill, MeetingTypePill } from '@/components/ui/StatusPill';
import { cn } from '@/lib/ui/cn';

export const metadata: Metadata = { title: 'My Meetings | ZPPSU SmartMin' };

interface Row {
  id: string;
  title: string;
  starts_at: string;
  venue: string | null;
  status: string;
  meeting_type: string;
  sub_type: string | null;
  is_emergency: boolean;
  ai_processed: boolean;
}

/** Department meetings plus any meeting the faculty member was invited to. ?m= highlights one (calendar / notification links). */
export default async function FacultyMyMeetingsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m: focusId } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from('meetings')
    .select('id, title, starts_at, venue, status, meeting_type, sub_type, is_emergency, ai_processed')
    .order('starts_at', { ascending: false })
    .limit(200);

  const meetings = (data as Row[] | null) ?? [];
  const todayStart = startOfManilaDay().getTime();
  const upcoming = meetings.filter((m) => new Date(m.starts_at).getTime() >= todayStart).reverse();
  const past = meetings.filter((m) => new Date(m.starts_at).getTime() < todayStart);

  function MeetingRow({ m }: { m: Row }) {
    const focused = m.id === focusId;
    return (
      <li
        id={`meeting-${m.id}`}
        aria-current={focused ? 'true' : undefined}
        className={cn('flex flex-wrap items-center justify-between gap-sm p-md', focused && 'bg-primary/5 ring-2 ring-inset ring-primary')}
      >
        <div className="min-w-0">
          <div className="mb-xs flex flex-wrap items-center gap-xs">
            <MeetingTypePill type={m.meeting_type} subType={m.sub_type} />
            {m.is_emergency ? <EmergencyPill /> : null}
          </div>
          <p className="font-body-md font-semibold">{m.title}</p>
          <p className="font-caption text-caption text-on-surface-variant">
            {fmtManila(m.starts_at)} · {m.venue || 'Venue to be announced'}
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <MeetingStatusPill status={m.status} />
          {m.ai_processed ? (
            <Link href={`/faculty/transcript-view?m=${m.id}`} className="inline-flex min-h-8 items-center gap-xs rounded-lg px-sm font-semibold text-primary hover:bg-primary/5">
              <Icon name="closed_caption" size={16} /> Transcript
            </Link>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">My Meetings</h1>
        <p className="font-body-lg text-on-surface-variant">Meetings in your department, and any meeting you&apos;re invited to.</p>
      </header>

      <section aria-labelledby="upcoming-h" className="mb-xl">
        <h2 id="upcoming-h" className="mb-sm font-h3 text-h3">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState icon="event_available" title="No upcoming meetings">
            When a meeting you&apos;re part of is scheduled, it appears here and on your calendar, and you&apos;re notified.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-lowest">
            {upcoming.map((m) => (
              <MeetingRow key={m.id} m={m} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="past-h">
        <h2 id="past-h" className="mb-sm font-h3 text-h3">
          Past
        </h2>
        {past.length === 0 ? (
          <p className="font-body-sm text-on-surface-variant">No past meetings yet.</p>
        ) : (
          <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-lowest">
            {past.map((m) => (
              <MeetingRow key={m.id} m={m} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
