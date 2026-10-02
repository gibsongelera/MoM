'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { MeetingType } from '@/lib/types/domain';

export default function ScheduleMeetingForm({ departmentId }: { departmentId: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [durationMin, setDurationMin] = useState(60);
  const [venue, setVenue] = useState('');
  const [meetingType, setMeetingType] = useState<MeetingType>('regular');
  const [subType, setSubType] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [agendaText, setAgendaText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startsAt || !departmentId) {
      setError('Title, date/time, and a department on your profile are all required.');
      return;
    }
    if (meetingType !== 'regular' && !subType.trim()) {
      setError('Capstone and research meetings need a sub-type.');
      return;
    }
    setSaving(true);
    setError(null);
    setOk(false);
    const agenda = agendaText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from('meetings').insert({
      title: title.trim(),
      starts_at: new Date(startsAt).toISOString(),
      duration_min: durationMin,
      venue: venue.trim() || null,
      department_id: departmentId,
      secretary_id: user?.id ?? null,
      meeting_type: meetingType,
      sub_type: meetingType === 'regular' ? null : subType.trim(),
      project_title: projectTitle.trim() || null,
      agenda,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setOk(true);
    setTitle('');
    setStartsAt('');
    setVenue('');
    setSubType('');
    setProjectTitle('');
    setAgendaText('');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg space-y-md max-w-2xl">
      <div>
        <label className="font-label-caps text-label-caps text-on-surface-variant">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <div>
          <label className="font-label-caps text-label-caps text-on-surface-variant">Date &amp; time</label>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm" />
        </div>
        <div>
          <label className="font-label-caps text-label-caps text-on-surface-variant">Duration (minutes)</label>
          <input type="number" min={15} step={15} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm" />
        </div>
      </div>

      <div>
        <label className="font-label-caps text-label-caps text-on-surface-variant">Venue</label>
        <input value={venue} onChange={(e) => setVenue(e.target.value)} className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <div>
          <label className="font-label-caps text-label-caps text-on-surface-variant">Type</label>
          <select value={meetingType} onChange={(e) => setMeetingType(e.target.value as MeetingType)} className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm">
            <option value="regular">Regular</option>
            <option value="capstone">Capstone</option>
            <option value="research">Research</option>
          </select>
        </div>
        {meetingType !== 'regular' ? (
          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant">Sub-type</label>
            <input
              value={subType}
              onChange={(e) => setSubType(e.target.value)}
              placeholder={meetingType === 'capstone' ? 'Title Proposal / Pre-Oral / Mock Defense / Final Presentation' : 'e.g. Proposal Defense'}
              className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm"
            />
          </div>
        ) : null}
      </div>

      {meetingType !== 'regular' ? (
        <div>
          <label className="font-label-caps text-label-caps text-on-surface-variant">Project title</label>
          <input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm" />
        </div>
      ) : null}

      <div>
        <label className="font-label-caps text-label-caps text-on-surface-variant">Agenda (one item per line)</label>
        <textarea value={agendaText} onChange={(e) => setAgendaText(e.target.value)} rows={4} className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm" />
      </div>

      {error ? <p className="text-error font-body-sm">{error}</p> : null}
      {ok ? <p className="text-success font-body-sm">Meeting scheduled.</p> : null}

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="bg-primary text-on-primary px-lg py-sm rounded-lg shadow-primary-md font-semibold disabled:opacity-60">
          {saving ? 'Scheduling...' : 'Schedule Meeting'}
        </button>
      </div>
    </form>
  );
}