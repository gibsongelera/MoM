'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export interface PersonalMeetingRow {
  id: string;
  title: string;
  meeting_date: string;
  meeting_time: string | null;
  type: string | null;
  attendees: string | null;
  notes: string | null;
}

export default function PersonalMeetingsManager({ initial }: { initial: PersonalMeetingRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState(initial);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState('Advising');
  const [attendees, setAttendees] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) {
      setError('Title and date are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('Session expired - please sign in again.');
      setSaving(false);
      return;
    }
    const { data, error: insertError } = await supabase
      .from('personal_meetings')
      .insert({
        user_id: user.id,
        title: title.trim(),
        meeting_date: date,
        meeting_time: time || null,
        type,
        attendees: attendees.trim() || null,
        notes: notes.trim() || null,
      })
      .select('id, title, meeting_date, meeting_time, type, attendees, notes')
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    if (data) setRows((r) => [data, ...r]);
    setTitle('');
    setDate('');
    setTime('');
    setAttendees('');
    setNotes('');
    router.refresh();
  }

  async function handleDelete(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!window.confirm(`Delete "${row?.title ?? 'this entry'}" from your log? This can't be undone.`)) return;
    setError(null);
    const { data, error: deleteError } = await supabase.from('personal_meetings').delete().eq('id', id).select('id');
    if (deleteError || !data?.length) {
      setError(`Couldn't delete the entry. ${deleteError?.message ?? 'Try again in a moment.'}`);
      return;
    }
    setRows((r) => r.filter((x) => x.id !== id));
    router.refresh();
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md mb-lg space-y-sm">
        <h3 className="font-h3 text-h3">Log a Personal Meeting</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-sm">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Thesis advising - Dela Cruz)" className="md:col-span-2 rounded-lg border-outline-variant bg-surface-container font-body-sm" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border-outline-variant bg-surface-container font-body-sm" />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-lg border-outline-variant bg-surface-container font-body-sm" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-sm">
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border-outline-variant bg-surface-container font-body-sm">
            <option>Advising</option>
            <option>Consultation</option>
            <option>One-on-one</option>
            <option>Other</option>
          </select>
          <input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="Attendees" className="rounded-lg border-outline-variant bg-surface-container font-body-sm" />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="rounded-lg border-outline-variant bg-surface-container font-body-sm" />
        </div>
        {error ? <p className="text-error font-body-sm">{error}</p> : null}
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md font-semibold disabled:opacity-60">
            {saving ? 'Logging...' : 'Log Meeting'}
          </button>
        </div>
      </form>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl divide-y divide-outline-variant">
        {rows.length === 0 ? (
          <p className="p-md text-on-surface-variant text-body-sm italic">No personal meetings logged yet.</p>
        ) : (
          rows.map((p) => (
            <div key={p.id} className="p-md flex items-start justify-between gap-md hover:bg-surface-container-low transition-colors">
              <div className="min-w-0">
                <div className="flex items-baseline gap-sm">
                  <p className="font-body-md font-semibold">{p.title}</p>
                  <span className="pill pill-regular">{p.type || 'Personal'}</span>
                </div>
                <p className="font-caption text-caption text-on-surface-variant mt-xs">
                  {p.meeting_date} {p.meeting_time ? `· ${p.meeting_time}` : ''}
                  {p.attendees ? ` · ${p.attendees}` : ''}
                </p>
                {p.notes ? <p className="font-body-sm text-on-surface-variant mt-xs">{p.notes}</p> : null}
              </div>
              <button onClick={() => handleDelete(p.id)} className="shrink-0 text-error hover:underline font-caption text-caption">
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}