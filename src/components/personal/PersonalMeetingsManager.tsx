'use client';

/**
 * Faculty → Personal Meetings: a private log of advising sessions,
 * consultations and one-on-ones, with full create / read / update / delete,
 * an archive, search and filters, and each entry's own recording +
 * transcript (opened on the entry's page).
 *
 * Every write is the owner's own row through the browser client (RLS
 * personal_meetings_write); writes ask for the row back so an RLS denial is
 * reported instead of silently "succeeding".
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  MODE_LABEL,
  PERSONAL_TYPES,
  STATUS_LABEL,
  fmtPersonalWhen,
  type PersonalMeeting,
  type PersonalStatus,
} from '@/lib/personal/types';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/ui/cn';
import PersonalMeetingForm, { type LinkableMeeting } from './PersonalMeetingForm';
import { TranscriptPill } from './TranscriptPill';

type DialogState =
  | { mode: 'create'; withRecording: boolean }
  | { mode: 'edit'; row: PersonalMeeting }
  | { mode: 'delete'; row: PersonalMeeting }
  | null;

const FORM_ID = 'personal-meeting-form';
const STATUS_PILL: Record<PersonalStatus, string> = { scheduled: 'pill-progress', done: 'pill-done', cancelled: 'pill-pending' };

function todayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export default function PersonalMeetingsManager({
  initial,
  userId,
  linkable,
  startCreate = null,
}: {
  initial: PersonalMeeting[];
  userId: string;
  linkable: LinkableMeeting[];
  /** Open the create dialog on arrival (dashboard quick actions). */
  startCreate?: 'recording' | 'log' | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<PersonalStatus | ''>('');
  const [dialog, setDialog] = useState<DialogState>(startCreate ? { mode: 'create', withRecording: startCreate === 'recording' } : null);
  const [busy, setBusy] = useState(false);

  // Keep in sync after router.refresh().
  const [lastInitial, setLastInitial] = useState(initial);
  if (lastInitial !== initial) {
    setLastInitial(initial);
    setRows(initial);
  }

  const today = todayKey();
  const active = rows.filter((r) => !r.archived_at);
  const archived = rows.filter((r) => r.archived_at);
  const monthPrefix = today.slice(0, 7);
  const stats = {
    total: active.length,
    thisMonth: active.filter((r) => r.meeting_date.startsWith(monthPrefix)).length,
    recordings: rows.filter((r) => r.audio_path).length,
    followUps: active.filter((r) => r.follow_up_date && r.follow_up_date >= today && r.status !== 'cancelled').length,
  };

  const q = query.trim().toLowerCase();
  const visible = (view === 'active' ? active : archived).filter((r) => {
    if (typeFilter && r.type !== typeFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (!q) return true;
    return [r.title, r.attendees, r.purpose, r.notes, r.outcome, r.location, r.type].some((v) => v?.toLowerCase().includes(q));
  });

  function close() {
    if (!busy) setDialog(null);
  }

  async function setArchived(row: PersonalMeeting, archive: boolean) {
    const archived_at = archive ? new Date().toISOString() : null;
    const { data, error } = await supabase.from('personal_meetings').update({ archived_at }).eq('id', row.id).select('id');
    if (error || !data?.length) {
      toast.error(`Couldn't ${archive ? 'archive' : 'restore'} it. ${error?.message ?? ''}`);
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, archived_at } : r)));
    toast.success(archive ? `"${row.title}" archived.` : `"${row.title}" restored.`);
    router.refresh();
  }

  async function remove() {
    if (dialog?.mode !== 'delete') return;
    const row = dialog.row;
    setBusy(true);
    const { data, error } = await supabase.from('personal_meetings').delete().eq('id', row.id).select('id');
    if (!error && data?.length && row.audio_path) {
      await supabase.storage.from('personal-audio').remove([row.audio_path]);
    }
    setBusy(false);
    if (error || !data?.length) {
      toast.error(`Couldn't delete it. ${error?.message ?? 'Try again in a moment.'}`);
      return;
    }
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    setDialog(null);
    toast.success(`"${row.title}" deleted.`);
    router.refresh();
  }

  function onSaved(row: PersonalMeeting) {
    const d = dialog;
    setDialog(null);
    if (d?.mode === 'create') {
      setRows((rs) => [row, ...rs]);
      toast.success(d.withRecording ? 'Saved. Now add the recording.' : 'Meeting logged.');
      router.push(`/faculty/personal-meetings/${row.id}${d.withRecording ? '#recording' : ''}`);
    } else {
      setRows((rs) => rs.map((r) => (r.id === row.id ? row : r)));
      toast.success('Changes saved.');
      router.refresh();
    }
  }

  const statTiles = [
    { label: 'In your log', value: stats.total, icon: 'event_note' },
    { label: 'This month', value: stats.thisMonth, icon: 'calendar_month' },
    { label: 'Recordings', value: stats.recordings, icon: 'graphic_eq' },
    { label: 'Follow-ups ahead', value: stats.followUps, icon: 'flag' },
  ];

  return (
    <>
      <div className="mb-lg flex flex-col justify-between gap-md md:flex-row md:items-end">
        <div>
          <h1 className="font-h1 text-h1">Personal Meetings</h1>
          <p className="font-body-md text-on-surface-variant">
            Advising sessions, consultations and one-on-ones — with your own recordings and transcripts. Private to you.
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <Button variant="secondary" icon="graphic_eq" onClick={() => setDialog({ mode: 'create', withRecording: true })}>
            Upload a recording
          </Button>
          <Button icon="add" onClick={() => setDialog({ mode: 'create', withRecording: false })}>
            Log a meeting
          </Button>
        </div>
      </div>

      <dl className="mb-lg grid grid-cols-2 gap-sm lg:grid-cols-4">
        {statTiles.map((s) => (
          <div key={s.label} className="flex items-center gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon name={s.icon} />
            </span>
            <div>
              <dt className="font-caption text-caption text-on-surface-variant">{s.label}</dt>
              <dd className="font-h3 text-h3 tabular-nums">{s.value}</dd>
            </div>
          </div>
        ))}
      </dl>

      <div className="mb-md flex flex-col gap-sm lg:flex-row lg:items-center">
        <div className="flex gap-xs rounded-xl bg-surface-container p-xs" role="tablist" aria-label="Which entries">
          {(
            [
              ['active', `Active (${active.length})`],
              ['archived', `Archived (${archived.length})`],
            ] as const
          ).map(([v, text]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                'min-h-9 rounded-lg px-md font-body-sm font-semibold transition-colors duration-150',
                view === v ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              {text}
            </button>
          ))}
        </div>
        <label className="relative flex-1">
          <span className="sr-only">Search your log</span>
          <Icon name="search" size={20} className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, people, notes…" className={cn(inputClass, 'pl-xl')} />
        </label>
        <div className="flex gap-sm">
          <label className="sr-only" htmlFor="pm-type">
            Type
          </label>
          <select id="pm-type" className={cn(inputClass, 'lg:w-48')} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {PERSONAL_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="pm-status">
            Status
          </label>
          <select id="pm-status" className={cn(inputClass, 'lg:w-40')} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PersonalStatus | '')}>
            <option value="">Any status</option>
            {(Object.keys(STATUS_LABEL) as PersonalStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={view === 'archived' ? 'inventory_2' : 'event_note'}
          title={
            (view === 'active' ? active : archived).length
              ? 'Nothing matches'
              : view === 'archived'
                ? 'Nothing archived'
                : 'Your log is empty'
          }
          action={
            view === 'active' && !active.length ? (
              <Button icon="add" onClick={() => setDialog({ mode: 'create', withRecording: false })}>
                Log a meeting
              </Button>
            ) : undefined
          }
        >
          {(view === 'active' ? active : archived).length
            ? 'Try another search or filter.'
            : view === 'archived'
              ? 'Archive entries you no longer need day to day; they stay searchable here.'
              : 'Log advising sessions and consultations, or upload a recording to get a transcript.'}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-md md:grid-cols-2 xl:grid-cols-3">
          {visible.map((r) => {
            const followDue = r.follow_up_date && r.follow_up_date >= today && r.status !== 'cancelled';
            return (
              <li key={r.id} className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-md transition-shadow duration-150 hover:shadow-primary-md">
                <div className="mb-sm flex flex-wrap items-center gap-xs">
                  <span className="pill pill-regular">{r.type ?? 'Personal'}</span>
                  <span className={cn('pill', STATUS_PILL[r.status])}>{STATUS_LABEL[r.status]}</span>
                  {r.audio_path ? <TranscriptPill status={r.transcript_status} className="ml-auto" /> : null}
                </div>
                <h3 className="font-h3 text-h3 leading-snug">
                  <Link href={`/faculty/personal-meetings/${r.id}`} className="hover:underline">
                    {r.title}
                  </Link>
                </h3>
                <dl className="mb-md mt-sm flex flex-col gap-xs font-body-sm text-on-surface-variant">
                  <div className="flex items-center gap-xs">
                    <dt>
                      <Icon name="schedule" size={16} />
                      <span className="sr-only">When</span>
                    </dt>
                    <dd>
                      {fmtPersonalWhen(r.meeting_date, r.meeting_time)}
                      {r.duration_min ? ` · ${r.duration_min} min` : ''}
                    </dd>
                  </div>
                  {r.mode || r.location ? (
                    <div className="flex items-center gap-xs">
                      <dt>
                        <Icon name={r.mode === 'online' ? 'videocam' : r.mode === 'phone' ? 'call' : 'place'} size={16} />
                        <span className="sr-only">Where</span>
                      </dt>
                      <dd className="truncate">{[r.mode ? MODE_LABEL[r.mode] : null, r.location].filter(Boolean).join(' · ')}</dd>
                    </div>
                  ) : null}
                  {r.attendees ? (
                    <div className="flex items-center gap-xs">
                      <dt>
                        <Icon name="group" size={16} />
                        <span className="sr-only">With</span>
                      </dt>
                      <dd className="truncate">{r.attendees}</dd>
                    </div>
                  ) : null}
                  {r.purpose ? <p className="line-clamp-2 text-on-surface">{r.purpose}</p> : null}
                  {followDue ? (
                    <p className="inline-flex items-center gap-xs font-semibold text-on-tertiary-fixed-variant">
                      <Icon name="flag" size={16} /> Follow up {fmtPersonalWhen(r.follow_up_date!, null)}
                    </p>
                  ) : null}
                </dl>
                <div className="mt-auto flex items-stretch gap-sm border-t border-outline-variant pt-md">
                  <Link href={`/faculty/personal-meetings/${r.id}`} className={buttonClasses('primary', 'md', 'flex-1 pl-sm')}>
                    <Icon name="open_in_new" size={18} /> Open
                  </Link>
                  <Button variant="secondary" icon="edit" onClick={() => setDialog({ mode: 'edit', row: r })} aria-label={`Edit ${r.title}`}>
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => void setArchived(r, !r.archived_at)}
                    aria-label={r.archived_at ? `Restore ${r.title}` : `Archive ${r.title}`}
                    title={r.archived_at ? 'Restore' : 'Archive'}
                  >
                    <Icon name={r.archived_at ? 'unarchive' : 'archive'} size={20} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-10 w-10 text-error"
                    onClick={() => setDialog({ mode: 'delete', row: r })}
                    aria-label={`Delete ${r.title}`}
                    title="Delete"
                  >
                    <Icon name="delete" size={20} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={dialog?.mode === 'create' || dialog?.mode === 'edit'}
        onClose={close}
        dismissible={!busy}
        size="lg"
        icon={dialog?.mode === 'create' && dialog.withRecording ? 'graphic_eq' : 'event_note'}
        title={dialog?.mode === 'edit' ? 'Edit entry' : dialog?.mode === 'create' && dialog.withRecording ? 'New recording' : 'Log a meeting'}
        description={dialog?.mode === 'create' && dialog.withRecording ? 'Describe the meeting first; you’ll upload or record the audio on the next screen.' : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} icon={dialog?.mode === 'create' && dialog.withRecording ? 'arrow_forward' : 'check'} loading={busy}>
              {dialog?.mode === 'edit' ? 'Save changes' : dialog?.mode === 'create' && dialog.withRecording ? 'Next: add audio' : 'Save'}
            </Button>
          </>
        }
      >
        {dialog?.mode === 'create' || dialog?.mode === 'edit' ? (
          <PersonalMeetingForm
            key={dialog.mode === 'edit' ? dialog.row.id : `new-${dialog.withRecording}`}
            formId={FORM_ID}
            userId={userId}
            initial={dialog.mode === 'edit' ? dialog.row : null}
            linkable={linkable}
            onBusyChange={setBusy}
            onSaved={onSaved}
            onError={(m) => toast.error(m)}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={dialog?.mode === 'delete'}
        onClose={close}
        dismissible={!busy}
        size="sm"
        icon="delete"
        title="Delete this entry?"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" icon="delete" onClick={remove} loading={busy}>
              Delete
            </Button>
          </>
        }
      >
        {dialog?.mode === 'delete' ? (
          <p className="font-body-sm">
            <strong>{dialog.row.title}</strong>
            {dialog.row.audio_path ? ', its recording and its transcript' : ''} will be permanently deleted. To keep it out of the way instead,{' '}
            <button
              type="button"
              className="font-semibold text-primary underline"
              onClick={() => {
                const row = dialog.row;
                setDialog(null);
                void setArchived(row, true);
              }}
            >
              archive it
            </button>
            .
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
