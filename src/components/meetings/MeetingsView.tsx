'use client';

/**
 * Secretary "Meetings" page body (renamed from "Meeting Schedule" at the
 * client's request). Lists today's and upcoming meetings with the recent past
 * below, and hosts the New / Edit / Emergency meeting dialogs.
 *
 * Fixes "hindi siya mag-seen": the old page was a bare form with no list, so a
 * saved meeting never appeared on it. Saving now opens the meeting's hub.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PersonOption } from '@/lib/types/domain';
import { fmtManilaDate, fmtManilaTime } from '@/lib/utils/datetime';
import { Dialog } from '@/components/ui/Dialog';
import { Button, buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { EmergencyPill, MeetingStatusPill, MeetingTypePill } from '@/components/ui/StatusPill';
import { useToast } from '@/components/ui/Toast';
import MeetingForm, { type MeetingFormInitial, type MeetingFormMode } from './MeetingForm';

export interface MeetingListItem extends MeetingFormInitial {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  is_emergency: boolean;
  participantIds: string[];
}

type DialogState = { mode: MeetingFormMode; meeting?: MeetingListItem } | null;

const FORM_ID = 'meeting-form';

export default function MeetingsView({
  upcoming,
  recent,
  departmentId,
  currentUserId,
  head,
  people,
  subtypes,
  startEmergency,
}: {
  upcoming: MeetingListItem[];
  recent: MeetingListItem[];
  departmentId: string;
  currentUserId: string;
  head: PersonOption | null;
  people: PersonOption[];
  subtypes: Record<'capstone' | 'research', string[]>;
  startEmergency: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogState>(startEmergency ? { mode: 'emergency' } : null);
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    setDialog(null);
    if (startEmergency) router.replace('/secretary/meetings');
  }

  function onSaved(id: string, warning?: string) {
    const mode = dialog?.mode;
    setDialog(null);
    if (warning) toast.error(warning);
    if (mode === 'emergency') {
      toast.success('Emergency meeting started. Participants have been notified.');
      router.push(`/secretary/live-recording?m=${id}`);
    } else if (mode === 'create') {
      toast.success('Meeting scheduled. Participants have been notified.');
      router.push(`/secretary/meetings/${id}`);
    } else {
      toast.success('Meeting updated.');
      router.refresh();
    }
  }

  const titleByMode: Record<MeetingFormMode, string> = {
    create: 'New meeting',
    edit: 'Edit meeting',
    emergency: 'Start an emergency meeting',
  };
  const submitByMode: Record<MeetingFormMode, string> = {
    create: 'Schedule meeting',
    edit: 'Save changes',
    emergency: 'Start meeting now',
  };

  return (
    <>
      <header className="mb-lg flex flex-col justify-between gap-md md:flex-row md:items-end">
        <div>
          <h1 className="font-h1 text-h1">Meetings</h1>
          <p className="font-body-md text-on-surface-variant">
            Schedule meetings ahead of time, or start an emergency meeting right now.
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <Button variant="secondary" icon="emergency" onClick={() => setDialog({ mode: 'emergency' })}>
            Start emergency meeting
          </Button>
          <Button icon="add" onClick={() => setDialog({ mode: 'create' })}>
            New meeting
          </Button>
        </div>
      </header>

      <section aria-labelledby="upcoming-heading" className="mb-xl">
        <h2 id="upcoming-heading" className="mb-md font-h3 text-h3">
          Today and upcoming
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState
            icon="event_available"
            title="No upcoming meetings"
            action={
              <Button icon="add" onClick={() => setDialog({ mode: 'create' })}>
                New meeting
              </Button>
            }
          >
            Scheduled meetings show here and on everyone&apos;s calendar. For a meeting that&apos;s happening now, start an emergency
            meeting.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-md md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((m) => (
              <MeetingCard key={m.id} meeting={m} onEdit={() => setDialog({ mode: 'edit', meeting: m })} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-heading">
        <div className="mb-md flex items-center justify-between gap-md">
          <h2 id="recent-heading" className="font-h3 text-h3">
            Recent
          </h2>
          <Link href="/secretary/archives" className={buttonClasses('ghost', 'sm')}>
            Meeting History <Icon name="arrow_forward" size={18} />
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="font-body-sm text-on-surface-variant">No past meetings yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-md md:grid-cols-2 xl:grid-cols-3">
            {recent.map((m) => (
              <MeetingCard key={m.id} meeting={m} onEdit={() => setDialog({ mode: 'edit', meeting: m })} />
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={dialog !== null}
        onClose={close}
        dismissible={!busy}
        size="lg"
        icon={dialog?.mode === 'emergency' ? 'emergency' : 'event'}
        title={dialog ? titleByMode[dialog.mode] : ''}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} loading={busy} icon={dialog?.mode === 'emergency' ? 'mic' : 'check'}>
              {dialog ? submitByMode[dialog.mode] : ''}
            </Button>
          </>
        }
      >
        {dialog ? (
          <MeetingForm
            key={`${dialog.mode}-${dialog.meeting?.id ?? 'new'}`}
            formId={FORM_ID}
            mode={dialog.mode}
            initial={dialog.meeting}
            departmentId={departmentId}
            currentUserId={currentUserId}
            head={head}
            people={people}
            subtypes={subtypes}
            onBusyChange={setBusy}
            onSaved={onSaved}
            onError={(m) => toast.error(m)}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function MeetingCard({ meeting: m, onEdit }: { meeting: MeetingListItem; onEdit: () => void }) {
  const people = m.participantIds.length + (m.guests?.length ?? 0);
  const panel = m.panel_members?.length ?? 0;
  return (
    <li className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
      <div className="mb-sm flex flex-wrap items-center gap-xs">
        <MeetingTypePill type={m.meeting_type} subType={m.sub_type} />
        {m.is_emergency ? <EmergencyPill /> : null}
        <MeetingStatusPill status={m.status} className="ml-auto" />
      </div>
      <h3 className="font-h3 text-h3 leading-snug">
        <Link href={`/secretary/meetings/${m.id}`} className="hover:underline">
          {m.title}
        </Link>
      </h3>
      {m.project_title ? <p className="mt-xs font-body-sm text-tertiary">{m.project_title}</p> : null}
      <dl className="mt-sm flex flex-col gap-xs font-body-sm text-on-surface-variant">
        <div className="flex items-center gap-xs">
          <dt>
            <Icon name="schedule" size={16} />
            <span className="sr-only">When</span>
          </dt>
          <dd>
            {fmtManilaDate(m.starts_at)} · {fmtManilaTime(m.starts_at)}
          </dd>
        </div>
        {m.venue ? (
          <div className="flex items-center gap-xs">
            <dt>
              <Icon name="place" size={16} />
              <span className="sr-only">Venue</span>
            </dt>
            <dd>{m.venue}</dd>
          </div>
        ) : null}
        <div className="flex items-center gap-xs">
          <dt>
            <Icon name="groups" size={16} />
            <span className="sr-only">People</span>
          </dt>
          <dd>
            {people} {people === 1 ? 'person' : 'people'}
            {m.meeting_type === 'capstone' && (m.chairperson_name || panel) ? ` · chair + ${panel} panel` : ''}
          </dd>
        </div>
      </dl>
      <div className="mt-md flex gap-sm border-t border-outline-variant pt-md">
        <Link href={`/secretary/meetings/${m.id}`} className={buttonClasses('primary', 'sm', 'flex-1')}>
          Open
        </Link>
        <Button variant="secondary" size="sm" icon="edit" onClick={onEdit} aria-label={`Edit ${m.title}`}>
          Edit
        </Button>
      </div>
    </li>
  );
}
