'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { SignModal } from '@/components/SignModal';
import { useData } from '@/components/DataProvider';
import { saveAttendance, logAudit } from '@/lib/db';
import { scopeMeetings } from '@/lib/scope';
import { ROLE_LABEL } from '@/lib/nav';
import { fmtDate, initials } from '@/lib/utils';
import type { AttendanceRecord, User } from '@/lib/types';

function Inner() {
  const { user, ready } = useRequireRole('secretary');
  usePageTitle('Attendance');
  const toast = useToast();
  const params = useSearchParams();
  const { meetings: allMeetings, users, departments, attendance, ready: dataReady } = useData();

  const meetings = useMemo(() => (user ? scopeMeetings(user, allMeetings) : []), [user, allMeetings]);

  const [activeId, setActiveId] = useState('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [signFor, setSignFor] = useState<string | null>(null);

  const effectiveId = activeId || params.get('m') || meetings[0]?.id || '';
  const meeting = effectiveId ? meetings.find((m) => m.id === effectiveId) : null;
  const dept = meeting ? departments.find((d) => d.id === meeting.departmentId) : null;

  useEffect(() => {
    if (!meeting) return;
    const existing = attendance.find((a) => a.meetingId === meeting.id);
    if (existing) {
      setRecords(existing.records);
      setStartedAt(existing.startedAt);
    } else {
      const invited = (meeting.participantIds || []).map((id) => users.find((u) => u.id === id)).filter(Boolean) as User[];
      setRecords(invited.map((u) => ({ userId: u.id, name: u.name, role: ROLE_LABEL[u.role] || u.role, department: departments.find((d) => d.id === u.departmentId)?.short, present: false, signatureDataUrl: '', signedAt: null })));
      setStartedAt(null);
    }
  }, [effectiveId, dataReady]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !user || !dataReady) return null;

  function persist(next: AttendanceRecord[], started: number | null) {
    if (!meeting) return;
    void saveAttendance({ meetingId: meeting.id, startedAt: started || Date.now(), records: next });
  }

  function startAttendance() {
    const now = Date.now();
    setStartedAt(now);
    persist(records, now);
    void logAudit('attendance_started', meeting?.title || '');
    toast('Attendance session started.', 'success');
  }
  function togglePresent(userId: string) {
    const next = records.map((r) => (r.userId === userId ? { ...r, present: !r.present } : r));
    setRecords(next);
    persist(next, startedAt);
  }
  function applySignature(userId: string, dataUrl: string) {
    const next = records.map((r) => (r.userId === userId ? { ...r, present: true, signatureDataUrl: dataUrl, signedAt: Date.now() } : r));
    setRecords(next);
    persist(next, startedAt);
    toast('Signature captured.', 'success');
  }

  async function exportDocx() {
    if (!meeting) return;
    try {
      const res = await fetch('/api/export/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Attendance Sheet — ${meeting.title}`,
          meeting: { title: meeting.title, date: fmtDate(meeting.date, true), venue: meeting.venue || '', department: dept?.name || '' },
          records,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Attendance_${meeting.title.replace(/[^a-z0-9]+/gi, '_')}.docx`;
      a.click();
      void logAudit('attendance_exported', meeting.title);
    } catch {
      toast('Export needs the server running with docx support. Attendance is still saved locally.', 'error');
    }
  }

  const presentCount = records.filter((r) => r.present).length;
  const quorumNeeded = records.length > 0 ? Math.floor(records.length / 2) + 1 : 0; // simple majority
  const quorumMet = records.length > 0 && presentCount >= quorumNeeded;

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg">
        <div>
          <h1 className="font-h1 text-h1 flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary text-[36px]">how_to_reg</span> Attendance
          </h1>
          <p className="font-body-md text-on-surface-variant">Capture sign-in and signatures before the meeting starts, then export a signed sheet.</p>
        </div>
        <div className="flex gap-sm flex-wrap">
          <select value={effectiveId} onChange={(e) => setActiveId(e.target.value)} className="bg-surface-container border-transparent focus:border-primary rounded-lg py-sm px-md">
            {meetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
          {!startedAt ? (
            <button onClick={startAttendance} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">play_circle</span> Start Attendance
            </button>
          ) : (
            <button onClick={exportDocx} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">description</span> Export .docx
            </button>
          )}
        </div>
      </header>

      {meeting ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
          <div className="p-md border-b border-outline-variant flex flex-wrap items-center justify-between gap-sm">
            <div>
              <h3 className="font-h3 text-h3">{meeting.title}</h3>
              <p className="font-caption text-caption text-on-surface-variant">
                {fmtDate(meeting.date, true)} · {meeting.venue || 'No venue'}{startedAt ? ` · Started ${fmtDate(startedAt, true)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-sm">
              <span className="pill pill-done">{presentCount} / {records.length} present</span>
              {records.length > 0 ? (
                <span className={`pill ${quorumMet ? 'pill-done' : 'pill-overdue'} flex items-center gap-xs`} title={`Quorum needs ${quorumNeeded} of ${records.length}`}>
                  <span className="material-symbols-outlined text-[13px]">{quorumMet ? 'verified' : 'gpp_maybe'}</span>
                  {quorumMet ? 'Quorum met' : `No quorum (${presentCount}/${quorumNeeded})`}
                </span>
              ) : null}
            </div>
          </div>
          {records.length === 0 ? (
            <p className="p-xl text-center text-on-surface-variant">No participants on this meeting. Add participants when scheduling.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    {['Name', 'Role', 'Present', 'Signature'].map((h) => <th key={h} className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.userId} className="border-b border-outline-variant hover:bg-surface-container-low">
                      <td className="py-sm px-md">
                        <div className="flex items-center gap-sm">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">{initials(r.name)}</div>
                          <span className="font-semibold">{r.name}</span>
                        </div>
                      </td>
                      <td className="py-sm px-md text-on-surface-variant">{r.role}</td>
                      <td className="py-sm px-md">
                        <button onClick={() => togglePresent(r.userId)} className={`pill ${r.present ? 'pill-done' : 'pill-pending'}`}>
                          <span className="material-symbols-outlined text-[12px]">{r.present ? 'check_circle' : 'radio_button_unchecked'}</span> {r.present ? 'Present' : 'Absent'}
                        </button>
                      </td>
                      <td className="py-sm px-md">
                        {r.signatureDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.signatureDataUrl} alt="signature" className="h-10" />
                        ) : (
                          <button onClick={() => setSignFor(r.userId)} className="text-primary hover:underline font-label-caps text-label-caps flex items-center gap-xs">
                            <span className="material-symbols-outlined text-[16px]">draw</span> Sign
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p className="text-on-surface-variant text-center py-xl">Select a meeting to take attendance.</p>
      )}

      <SignModal
        open={!!signFor}
        onClose={() => setSignFor(null)}
        title="Attendee Signature"
        subtitle={signFor ? records.find((r) => r.userId === signFor)?.name : ''}
        onConfirm={(url) => { if (signFor) applySignature(signFor, url); }}
      />
    </div>
  );
}

export default function SecretaryAttendance() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
