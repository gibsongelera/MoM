'use client';

/**
 * Attendance for one meeting (ported from the root app's attendance page,
 * reworked around the client's flow: the roster is built automatically from
 * the people on the meeting — accounts, typed chairperson/panel, guests — and
 * the secretary marks who is present, collects signatures, and adds walk-ins).
 *
 * Every change is saved immediately (upsert on meeting_id) and a failed save
 * is reported, never swallowed.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { quorum, walkIn, type AttendanceRecord } from '@/lib/meetings/roster';
import { normalizeName } from '@/lib/meetings/people';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/ui/cn';
import SignaturePad from '@/components/dashboard/SignaturePad';

/** Event-time timestamp (kept out of the component body for the purity lint). */
const nowMs = () => Date.now();

export default function AttendancePanel({
  meetingId,
  initialRecords,
  startedAt,
  canEdit,
}: {
  meetingId: string;
  initialRecords: AttendanceRecord[];
  startedAt: number | null;
  canEdit: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();
  const [records, setRecords] = useState(initialRecords);
  const [saving, setSaving] = useState(false);
  const [signFor, setSignFor] = useState<AttendanceRecord | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [walkInName, setWalkInName] = useState('');
  const [walkInOffice, setWalkInOffice] = useState('');

  const q = quorum(records);

  async function persist(next: AttendanceRecord[], successMessage?: string) {
    const previous = records;
    setRecords(next);
    setSaving(true);
    const { error } = await supabase
      .from('attendance')
      .upsert({ meeting_id: meetingId, started_at: startedAt ?? nowMs(), records: next }, { onConflict: 'meeting_id' });
    setSaving(false);
    if (error) {
      setRecords(previous);
      toast.error(`Attendance wasn't saved. ${error.message}`);
      return false;
    }
    if (successMessage) toast.success(successMessage);
    router.refresh();
    return true;
  }

  function togglePresent(key: string) {
    void persist(records.map((r) => (r.key === key ? { ...r, present: !r.present } : r)));
  }

  async function confirmSignature() {
    if (!signFor || !signature) return;
    const ok = await persist(
      records.map((r) => (r.key === signFor.key ? { ...r, present: true, signatureDataUrl: signature, signedAt: nowMs() } : r)),
      `Signature saved for ${signFor.name}.`,
    );
    if (ok) {
      setSignFor(null);
      setSignature(null);
    }
  }

  async function addWalkIn(e: FormEvent) {
    e.preventDefault();
    const name = normalizeName(walkInName);
    if (!name) return;
    if (records.some((r) => r.name.toLocaleLowerCase('en') === name.toLocaleLowerCase('en'))) {
      toast.error(`${name} is already on the list.`);
      return;
    }
    const ok = await persist([...records, walkIn(name, walkInOffice)], `${name} added and marked present.`);
    if (ok) {
      setWalkInName('');
      setWalkInOffice('');
    }
  }

  return (
    <section aria-labelledby="attendance-heading" className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <h2 id="attendance-heading" className="font-h3 text-h3">
          Attendance
        </h2>
        <div className="flex items-center gap-xs" aria-live="polite">
          <span className="pill pill-done">
            {q.present} of {q.total} present
          </span>
          {q.total ? (
            <span className={cn('pill', q.met ? 'pill-done' : 'pill-overdue')}>
              <Icon name={q.met ? 'verified' : 'gpp_maybe'} size={14} />
              {q.met ? 'Quorum met' : `Quorum needs ${q.needed}`}
            </span>
          ) : null}
          {saving ? <span className="font-caption text-caption text-on-surface-variant">Saving…</span> : null}
        </div>
      </div>

      {records.length === 0 ? (
        <p className="rounded-xl border border-dashed border-outline-variant p-lg text-center font-body-sm text-on-surface-variant">
          No one is on this meeting yet. Add participants or guests to the meeting, or add walk-ins below.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-left text-body-sm">
            <caption className="sr-only">Attendance list</caption>
            <thead className="border-b border-outline-variant bg-surface-container-low">
              <tr>
                <th scope="col" className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant">
                  Name
                </th>
                <th scope="col" className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant">
                  Present
                </th>
                <th scope="col" className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant">
                  Signature
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.key} className="border-b border-outline-variant last:border-0">
                  <th scope="row" className="px-md py-sm text-left font-normal">
                    <span className="block font-semibold text-on-surface">{r.name}</span>
                    <span className="block font-caption text-caption text-on-surface-variant">
                      {r.role}
                      {!r.userId ? ' · no account' : ''}
                    </span>
                  </th>
                  <td className="px-md py-sm">
                    <Button
                      variant={r.present ? 'primary' : 'secondary'}
                      size="sm"
                      aria-pressed={r.present}
                      disabled={!canEdit || saving}
                      onClick={() => togglePresent(r.key)}
                      aria-label={`${r.name}: ${r.present ? 'present' : 'absent'}`}
                    >
                      <Icon name={r.present ? 'check_circle' : 'radio_button_unchecked'} size={16} />
                      {r.present ? 'Present' : 'Absent'}
                    </Button>
                  </td>
                  <td className="px-md py-sm">
                    {r.signatureDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data: URL captured on the signature pad
                      <img src={r.signatureDataUrl} alt={`Signature of ${r.name}`} className="h-10 max-w-[160px] object-contain" />
                    ) : canEdit ? (
                      <Button variant="ghost" size="sm" icon="draw" onClick={() => setSignFor(r)}>
                        Sign
                      </Button>
                    ) : (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit ? (
        <form onSubmit={addWalkIn} className="flex flex-col gap-sm rounded-xl border border-outline-variant bg-surface-container-low p-md sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="walkin-name" className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Walk-in name
            </label>
            <input
              id="walkin-name"
              className={`${inputClass} mt-xs`}
              maxLength={120}
              value={walkInName}
              onChange={(e) => setWalkInName(e.target.value)}
              placeholder="Someone who arrived without being listed"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="walkin-office" className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Office / school (optional)
            </label>
            <input
              id="walkin-office"
              className={`${inputClass} mt-xs`}
              maxLength={120}
              value={walkInOffice}
              onChange={(e) => setWalkInOffice(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" icon="person_add" disabled={!normalizeName(walkInName) || saving}>
            Add walk-in
          </Button>
        </form>
      ) : null}

      <Dialog
        open={signFor !== null}
        onClose={() => {
          setSignFor(null);
          setSignature(null);
        }}
        dismissible={!saving}
        title="Attendance signature"
        icon="draw"
        description={signFor ? `${signFor.name} — ${signFor.role}` : undefined}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setSignFor(null);
                setSignature(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button icon="check" onClick={confirmSignature} disabled={!signature} loading={saving}>
              Save signature
            </Button>
          </>
        }
      >
        {signFor ? <SignaturePad key={signFor.key} onChange={setSignature} label={`Signature of ${signFor.name}`} /> : null}
      </Dialog>
    </section>
  );
}
