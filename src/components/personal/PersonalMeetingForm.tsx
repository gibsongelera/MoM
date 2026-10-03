'use client';

/**
 * Create / edit a personal meeting. Rendered inside a Dialog; the dialog's
 * footer submits it through `form={formId}`.
 *
 * Fields were chosen for what an advising / consultation log is actually
 * used for later: who it was with, why (purpose), what was agreed (outcome),
 * and when to follow up — plus an optional link to an institutional meeting
 * the faculty member attended (RLS + trigger only allow meetings they can see).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Field, inputClass } from '@/components/ui/Field';
import { fmtManilaDate } from '@/lib/utils/datetime';
import {
  MODE_LABEL,
  PERSONAL_COLUMNS,
  PERSONAL_TYPES,
  STATUS_LABEL,
  type PersonalMeeting,
  type PersonalMode,
  type PersonalStatus,
} from '@/lib/personal/types';

export interface LinkableMeeting {
  id: string;
  title: string;
  starts_at: string;
}

type Draft = {
  title: string;
  meeting_date: string;
  meeting_time: string;
  type: string;
  status: PersonalStatus;
  mode: PersonalMode | '';
  location: string;
  duration_min: string;
  attendees: string;
  purpose: string;
  notes: string;
  outcome: string;
  follow_up_date: string;
  meeting_id: string;
};

/** Today in Manila as YYYY-MM-DD (en-CA renders ISO order). */
function todayManila(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function toDraft(p?: Partial<PersonalMeeting> | null): Draft {
  return {
    title: p?.title ?? '',
    meeting_date: p?.meeting_date ?? todayManila(),
    meeting_time: p?.meeting_time?.slice(0, 5) ?? '',
    type: p?.type ?? 'Advising',
    status: p?.status ?? 'done',
    mode: p?.mode ?? 'in_person',
    location: p?.location ?? '',
    duration_min: p?.duration_min ? String(p.duration_min) : '',
    attendees: p?.attendees ?? '',
    purpose: p?.purpose ?? '',
    notes: p?.notes ?? '',
    outcome: p?.outcome ?? '',
    follow_up_date: p?.follow_up_date ?? '',
    meeting_id: p?.meeting_id ?? '',
  };
}

export default function PersonalMeetingForm({
  formId,
  userId,
  initial,
  defaults,
  linkable = [],
  onBusyChange,
  onSaved,
  onError,
}: {
  formId: string;
  userId: string;
  /** Present when editing. */
  initial?: PersonalMeeting | null;
  /** Prefill for a new entry (e.g. from a meeting page). */
  defaults?: Partial<PersonalMeeting>;
  linkable?: LinkableMeeting[];
  onBusyChange?: (busy: boolean) => void;
  onSaved: (row: PersonalMeeting) => void;
  onError: (message: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial ?? defaults));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  function validate(d: Draft) {
    const e: Partial<Record<keyof Draft, string>> = {};
    if (!d.title.trim()) e.title = 'Give it a short title, e.g. "Thesis advising — Group 3".';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.meeting_date)) e.meeting_date = 'Pick the date.';
    if (d.duration_min && !(Number(d.duration_min) >= 1 && Number(d.duration_min) <= 1440)) e.duration_min = 'Minutes between 1 and 1440.';
    if (d.follow_up_date && d.follow_up_date < d.meeting_date) e.follow_up_date = 'The follow-up should be on or after the meeting date.';
    return e;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    onBusyChange?.(true);
    const body = {
      title: draft.title.trim(),
      meeting_date: draft.meeting_date,
      meeting_time: draft.meeting_time || null,
      type: draft.type || null,
      status: draft.status,
      mode: draft.mode || null,
      location: draft.location.trim() || null,
      duration_min: draft.duration_min ? Number(draft.duration_min) : null,
      attendees: draft.attendees.trim() || null,
      purpose: draft.purpose.trim() || null,
      notes: draft.notes.trim() || null,
      outcome: draft.outcome.trim() || null,
      follow_up_date: draft.follow_up_date || null,
      meeting_id: draft.meeting_id || null,
    };
    const { data, error } = initial
      ? await supabase.from('personal_meetings').update(body).eq('id', initial.id).select(PERSONAL_COLUMNS).single()
      : await supabase.from('personal_meetings').insert({ ...body, user_id: userId }).select(PERSONAL_COLUMNS).single();
    onBusyChange?.(false);
    if (error || !data) {
      onError(`Couldn't save. ${error?.message ?? 'Try again in a moment.'}`);
      return;
    }
    onSaved(data as unknown as PersonalMeeting);
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="grid grid-cols-1 gap-md sm:grid-cols-6">
      <Field label="Title" required error={errors.title} className="sm:col-span-6">
        {(p) => <input {...p} className={inputClass} value={draft.title} onChange={(e) => set('title', e.target.value)} maxLength={200} placeholder="Thesis advising — Group 3" />}
      </Field>

      <Field label="Date" required error={errors.meeting_date} className="sm:col-span-2">
        {(p) => <input {...p} type="date" className={inputClass} value={draft.meeting_date} onChange={(e) => set('meeting_date', e.target.value)} />}
      </Field>
      <Field label="Time" className="sm:col-span-2">
        {(p) => <input {...p} type="time" className={inputClass} value={draft.meeting_time} onChange={(e) => set('meeting_time', e.target.value)} />}
      </Field>
      <Field label="Length (minutes)" error={errors.duration_min} className="sm:col-span-2">
        {(p) => (
          <input {...p} type="number" inputMode="numeric" min={1} max={1440} className={inputClass} value={draft.duration_min} onChange={(e) => set('duration_min', e.target.value)} placeholder="30" />
        )}
      </Field>

      <Field label="Type" className="sm:col-span-2">
        {(p) => (
          <select {...p} className={inputClass} value={draft.type} onChange={(e) => set('type', e.target.value)}>
            {PERSONAL_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
            {draft.type && !(PERSONAL_TYPES as readonly string[]).includes(draft.type) ? <option>{draft.type}</option> : null}
          </select>
        )}
      </Field>
      <Field label="Status" className="sm:col-span-2">
        {(p) => (
          <select {...p} className={inputClass} value={draft.status} onChange={(e) => set('status', e.target.value as PersonalStatus)}>
            {(Object.keys(STATUS_LABEL) as PersonalStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Mode" className="sm:col-span-2">
        {(p) => (
          <select {...p} className={inputClass} value={draft.mode} onChange={(e) => set('mode', e.target.value as PersonalMode | '')}>
            {(Object.keys(MODE_LABEL) as PersonalMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label={draft.mode === 'online' ? 'Link or platform' : 'Location'} className="sm:col-span-3">
        {(p) => (
          <input
            {...p}
            className={inputClass}
            value={draft.location}
            onChange={(e) => set('location', e.target.value)}
            maxLength={200}
            placeholder={draft.mode === 'online' ? 'Google Meet' : 'Faculty room, Bldg A'}
          />
        )}
      </Field>
      <Field label="With" hint="Names, separated by commas." className="sm:col-span-3">
        {(p) => <input {...p} className={inputClass} value={draft.attendees} onChange={(e) => set('attendees', e.target.value)} placeholder="K. Mendoza, J. Aquino" />}
      </Field>

      <Field label="Purpose / agenda" className="sm:col-span-6">
        {(p) => <textarea {...p} rows={2} maxLength={2000} className={inputClass} value={draft.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="Review chapter 3 revisions" />}
      </Field>
      <Field label="Notes" className="sm:col-span-6">
        {(p) => <textarea {...p} rows={3} className={inputClass} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />}
      </Field>
      <Field label="Outcome / agreements" hint="What was decided, and who does what next." className="sm:col-span-4">
        {(p) => <textarea {...p} rows={2} maxLength={4000} className={inputClass} value={draft.outcome} onChange={(e) => set('outcome', e.target.value)} />}
      </Field>
      <Field label="Follow up on" error={errors.follow_up_date} className="sm:col-span-2">
        {(p) => <input {...p} type="date" className={inputClass} value={draft.follow_up_date} onChange={(e) => set('follow_up_date', e.target.value)} />}
      </Field>

      {linkable.length ? (
        <Field label="About an institutional meeting (optional)" hint="Link this entry to a meeting you attended." className="sm:col-span-6">
          {(p) => (
            <select {...p} className={inputClass} value={draft.meeting_id} onChange={(e) => set('meeting_id', e.target.value)}>
              <option value="">Not linked</option>
              {linkable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} · {fmtManilaDate(m.starts_at)}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
    </form>
  );
}
