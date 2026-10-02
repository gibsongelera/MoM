'use client';

/**
 * Create / edit / start-emergency meeting form (rendered inside a Dialog; the
 * Dialog footer's submit button targets this form via `formId`).
 *
 * People model (0016): participants with accounts go to meeting_participants
 * and are notified by the database; guests, the capstone chairperson, panel
 * and adviser are typed names, optionally linked to an account. The approving
 * chair (department head) is set by the database, not chosen here.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Meeting, MeetingGuest, MeetingType, PanelMember, PersonOption } from '@/lib/types/domain';
import { DEFAULT_PANEL_ROWS, cleanGuests, cleanPanel, normalizeName, validatePeople } from '@/lib/meetings/people';
import { fmtManila, fromManilaInput, manilaDateKey, toManilaInput } from '@/lib/utils/datetime';
import { Field, inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import ParticipantsPicker from './ParticipantsPicker';
import GuestsField from './GuestsField';
import PanelMembersField from './PanelMembersField';
import PersonField, { type PersonValue } from './PersonField';

export type MeetingFormMode = 'create' | 'edit' | 'emergency';

export interface MeetingFormInitial
  extends Partial<
    Pick<
      Meeting,
      | 'id'
      | 'title'
      | 'starts_at'
      | 'duration_min'
      | 'venue'
      | 'meeting_type'
      | 'sub_type'
      | 'project_title'
      | 'agenda'
      | 'guests'
      | 'chairperson_name'
      | 'chairperson_id'
      | 'panel_members'
      | 'adviser_name'
      | 'adviser_id'
    >
  > {
  participantIds?: string[];
}

type Errors = Partial<Record<'title' | 'startsAt' | 'subType' | 'duration' | 'guests' | 'panel' | 'chairperson' | 'form', string>>;

function defaultStart(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${manilaDateKey(tomorrow)}T09:00`;
}

export default function MeetingForm({
  formId,
  mode,
  initial,
  departmentId,
  currentUserId,
  head,
  people,
  subtypes,
  onSaved,
  onBusyChange,
  onError,
}: {
  formId: string;
  mode: MeetingFormMode;
  initial?: MeetingFormInitial;
  departmentId: string;
  currentUserId: string;
  /** Department head: the approving chair, set automatically by the database. */
  head: PersonOption | null;
  people: PersonOption[];
  subtypes: Record<'capstone' | 'research', string[]>;
  onSaved: (meetingId: string, warning?: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onError?: (message: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const isEmergency = mode === 'emergency';

  const [type, setType] = useState<MeetingType>(initial?.meeting_type ?? 'regular');
  const [subType, setSubType] = useState(initial?.sub_type ?? '');
  const [title, setTitle] = useState(
    initial?.title ?? (isEmergency ? `Emergency meeting — ${fmtManila(new Date(), { month: 'short', day: 'numeric', year: 'numeric' })}` : ''),
  );
  const [projectTitle, setProjectTitle] = useState(initial?.project_title ?? '');
  const [startsAt, setStartsAt] = useState(initial?.starts_at ? toManilaInput(initial.starts_at) : defaultStart());
  const [duration, setDuration] = useState(initial?.duration_min ?? 60);
  const [venue, setVenue] = useState(initial?.venue ?? '');
  const [agendaText, setAgendaText] = useState((initial?.agenda ?? []).join('\n'));
  const [participantIds, setParticipantIds] = useState<string[]>(initial?.participantIds ?? []);
  const [guests, setGuests] = useState<MeetingGuest[]>(initial?.guests ?? []);
  const [chair, setChair] = useState<PersonValue>({
    name: initial?.chairperson_name ?? '',
    userId: initial?.chairperson_id ?? null,
  });
  const [panel, setPanel] = useState<PanelMember[]>(
    initial?.panel_members?.length ? initial.panel_members : Array.from({ length: DEFAULT_PANEL_ROWS }, () => ({ name: '' })),
  );
  const [adviser, setAdviser] = useState<PersonValue>({
    name: initial?.adviser_name ?? '',
    userId: initial?.adviser_id ?? null,
  });
  const [errors, setErrors] = useState<Errors>({});

  const isProject = type !== 'regular';
  const subOptions = isProject ? subtypes[type] ?? [] : [];

  function validate(): Errors {
    const next: Errors = {};
    if (!normalizeName(title)) next.title = 'Give the meeting a title.';
    else if (title.trim().length > 160) next.title = 'Keep the title under 160 characters.';
    if (!isEmergency) {
      if (!startsAt) next.startsAt = 'Choose the date and time.';
      else if (mode === 'create' && new Date(fromManilaInput(startsAt)).getTime() < Date.now() - 5 * 60 * 1000) {
        next.startsAt = 'That time has already passed. For a meeting happening now, use “Start emergency meeting”.';
      }
      if (!Number.isFinite(duration) || duration < 15 || duration > 600) next.duration = 'Use a duration between 15 and 600 minutes.';
    }
    if (isProject && !subType) next.subType = `Choose what kind of ${type} meeting this is.`;
    Object.assign(next, validatePeople({ guests, panel, chairpersonName: chair.name, isCapstone: type === 'capstone' }));
    return next;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    const firstInvalid = (['title', 'startsAt', 'duration', 'subType'] as const).find((k) => found[k]);
    if (Object.keys(found).length) {
      if (firstInvalid) document.getElementById(`meeting-${firstInvalid}`)?.focus();
      return;
    }

    onBusyChange?.(true);
    const id = initial?.id ?? crypto.randomUUID();
    const cleanedPanel = type === 'capstone' ? cleanPanel(panel) : [];
    const row: Record<string, unknown> = {
      title: normalizeName(title),
      duration_min: isEmergency ? 60 : duration,
      venue: normalizeName(venue) || null,
      meeting_type: type,
      sub_type: isProject ? subType : null,
      project_title: isProject ? normalizeName(projectTitle) || null : null,
      agenda: agendaText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      guests: cleanGuests(guests),
      chairperson_name: type === 'capstone' ? normalizeName(chair.name) || null : null,
      chairperson_id: type === 'capstone' ? chair.userId ?? null : null,
      panel_members: cleanedPanel,
      adviser_name: isProject ? normalizeName(adviser.name) || null : null,
      adviser_id: isProject ? adviser.userId ?? null : null,
    };
    if (!(isEmergency && initial?.id)) {
      row.starts_at = isEmergency ? new Date().toISOString() : fromManilaInput(startsAt);
    }

    let saveError: string | null = null;
    if (mode === 'edit') {
      const { data, error } = await supabase.from('meetings').update(row).eq('id', id).select('id');
      if (error) saveError = error.message;
      else if (!data?.length) saveError = "You don't have permission to edit this meeting.";
    } else {
      // The id is generated here, so no RETURNING is needed.
      const { error } = await supabase.from('meetings').insert({
        ...row,
        id,
        department_id: departmentId,
        secretary_id: currentUserId,
        is_emergency: isEmergency,
      });
      if (error) saveError = error.message;
    }

    if (saveError) {
      onBusyChange?.(false);
      setErrors({ form: saveError });
      onError?.(`Couldn't save the meeting. ${saveError}`);
      return;
    }

    // Participants: add new ones (the database notifies them) and remove
    // anyone unticked, except people on the meeting through a role.
    const roleIds = new Set(
      [head?.id, cleanedPanel.map((p) => p.userId), chair.userId, adviser.userId].flat().filter(Boolean) as string[],
    );
    const before = new Set(initial?.participantIds ?? []);
    const desired = new Set(participantIds);
    const toAdd = [...desired].filter((u) => !before.has(u));
    const toRemove = [...before].filter((u) => !desired.has(u) && !roleIds.has(u));
    let warning: string | undefined;
    if (toAdd.length) {
      const { error } = await supabase
        .from('meeting_participants')
        .upsert(toAdd.map((user_id) => ({ meeting_id: id, user_id })), { onConflict: 'meeting_id,user_id', ignoreDuplicates: true });
      if (error) warning = 'The meeting was saved, but some participants could not be added.';
    }
    if (toRemove.length) {
      const { error } = await supabase.from('meeting_participants').delete().eq('meeting_id', id).in('user_id', toRemove);
      if (error) warning = 'The meeting was saved, but some participants could not be removed.';
    }

    onBusyChange?.(false);
    onSaved(id, warning);
  }

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-lg">
      {errors.form ? (
        <div role="alert" className="rounded-lg bg-error-container p-sm font-body-sm text-on-error-container">
          {errors.form}
        </div>
      ) : null}

      {isEmergency ? (
        <p className="flex items-start gap-sm rounded-lg border border-error/30 bg-error/5 p-sm font-body-sm text-on-surface">
          <Icon name="emergency" size={20} className="text-error" />
          <span>
            This meeting starts <strong>now</strong>. After you start it you&apos;ll go straight to recording; the people below are
            notified right away.
          </span>
        </p>
      ) : null}

      <section className="grid grid-cols-1 gap-md sm:grid-cols-2">
        <Field label="Meeting type">
          {(p) => (
            <select
              {...p}
              className={inputClass}
              value={type}
              onChange={(e) => {
                setType(e.target.value as MeetingType);
                setSubType('');
              }}
            >
              <option value="regular">Regular</option>
              <option value="capstone">Capstone</option>
              <option value="research">Research</option>
            </select>
          )}
        </Field>
        {isProject ? (
          <Field id="meeting-subType" label="Kind" required error={errors.subType}>
            {(p) => (
              <select {...p} className={inputClass} value={subType} onChange={(e) => setSubType(e.target.value)}>
                <option value="">Choose…</option>
                {subOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <Field id="meeting-title" label="Title" required error={errors.title} className="sm:col-span-2">
          {(p) => (
            <input
              {...p}
             
              className={inputClass}
              value={title}
              maxLength={160}
              placeholder="e.g. Faculty Senate Monthly Meeting"
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        {isProject ? (
          <Field label="Project / research title" className="sm:col-span-2">
            {(p) => (
              <input
                {...p}
                className={inputClass}
                value={projectTitle}
                maxLength={300}
                placeholder="e.g. SmartMin: AI-Assisted Meeting Governance"
                onChange={(e) => setProjectTitle(e.target.value)}
              />
            )}
          </Field>
        ) : null}
      </section>

      {!isEmergency ? (
        <section className="grid grid-cols-1 gap-md sm:grid-cols-3">
          <Field id="meeting-startsAt" label="Date & time" required error={errors.startsAt} hint="Philippine time" className="sm:col-span-2">
            {(p) => (
              <input
                {...p}
               
                type="datetime-local"
                className={inputClass}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            )}
          </Field>
          <Field id="meeting-duration" label="Duration (minutes)" error={errors.duration}>
            {(p) => (
              <input
                {...p}
               
                type="number"
                min={15}
                max={600}
                step={15}
                className={inputClass}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            )}
          </Field>
        </section>
      ) : null}

      <Field label="Venue">
        {(p) => (
          <input
            {...p}
            className={inputClass}
            value={venue}
            maxLength={160}
            placeholder="e.g. CICS Conference Room"
            onChange={(e) => setVenue(e.target.value)}
          />
        )}
      </Field>

      {type === 'capstone' ? (
        <section className="flex flex-col gap-md rounded-xl border border-tertiary-container/50 bg-tertiary-fixed/20 p-md">
          <h3 className="flex items-center gap-xs font-body-md font-semibold text-on-surface">
            <Icon name="school" size={20} className="text-tertiary" /> Defense panel
          </h3>
          <Field
            label="Chairperson"
            error={errors.chairperson}
            hint="Type any name — they don't need an account. Pick a suggestion to link someone who does."
          >
            {(p) => (
              <PersonField
                id={p.id}
                describedBy={p['aria-describedby']}
                invalid={!!errors.chairperson}
                value={chair}
                onChange={setChair}
                options={people}
                placeholder="Type the chairperson's name"
              />
            )}
          </Field>
          <PanelMembersField value={panel} onChange={setPanel} options={people} error={errors.panel} />
          <Field label="Adviser">
            {(p) => (
              <PersonField
                id={p.id}
                describedBy={p['aria-describedby']}
                value={adviser}
                onChange={setAdviser}
                options={people}
                placeholder="Type the adviser's name"
              />
            )}
          </Field>
        </section>
      ) : type === 'research' ? (
        <Field label="Adviser / lead researcher">
          {(p) => (
            <PersonField
              id={p.id}
              describedBy={p['aria-describedby']}
              value={adviser}
              onChange={setAdviser}
              options={people}
              placeholder="Type a name"
            />
          )}
        </Field>
      ) : null}

      <ParticipantsPicker
        people={people}
        selected={participantIds}
        onChange={setParticipantIds}
        lockedIds={head ? [head.id] : []}
      />
      {head ? (
        <p className="-mt-sm flex items-center gap-xs font-caption text-caption text-on-surface-variant">
          <Icon name="verified_user" size={16} /> Minutes are approved by {head.name}, the department head.
        </p>
      ) : null}

      <GuestsField value={guests} onChange={setGuests} error={errors.guests} />

      {!isEmergency ? (
        <Field label="Agenda" hint="One item per line">
          {(p) => (
            <textarea {...p} rows={4} className={inputClass} value={agendaText} onChange={(e) => setAgendaText(e.target.value)} />
          )}
        </Field>
      ) : null}
    </form>
  );
}
