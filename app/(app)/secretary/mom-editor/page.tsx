'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { SignModal } from '@/components/SignModal';
import { Avatar } from '@/components/Avatar';
import { useData } from '@/components/DataProvider';
import {
  saveMinutes,
  signMinutes,
  amendMinutes,
  routeMinutesForApproval,
  updateMinutesComments,
  updateMeetingFields,
  notifyUser,
  logAudit,
} from '@/lib/db';
import { draftMinutesFromTranscript, docTitleFor, fileNameFor } from '@/lib/summarizer';
import { downloadMinutesDocx } from '@/lib/export';
import { readHandwrittenNotes, translateText } from '@/lib/ai-client';
import { translate as localTranslate } from '@/lib/translator';
import { fmtDate, uid } from '@/lib/utils';
import type { AgendaItem, Comment, MeetingType, Minutes, Motion, PaperNote, Signature, User } from '@/lib/types';

function emptyMinutes(meetingId: string): Minutes {
  return { id: '', meetingId, status: 'draft', callToOrder: '', previousMinutes: '', agendaItems: [], actionItems: [], adjournment: '', signatures: [], comments: [], amendments: [], lockedAt: null, lockedBy: null };
}

function Inner() {
  const { user, ready } = useRequireRole('secretary');
  usePageTitle('Document Editor');
  const toast = useToast();
  const params = useSearchParams();

  const { meetings: allMeetings, users, departments, tasks: allTasks, transcripts, minutes: allMinutes, taxonomy, ready: dataReady, refresh } = useData();

  const meetings = useMemo(
    () => (user ? allMeetings.filter((m) => m.departmentId === user.departmentId || m.secretaryId === user.id) : []),
    [user, allMeetings],
  );

  const [activeId, setActiveId] = useState('');
  const [min, setMin] = useState<Minutes>(() => emptyMinutes(''));
  const [hadLocked, setHadLocked] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [ppOpen, setPpOpen] = useState(false);
  const [pp, setPp] = useState({ type: 'regular' as MeetingType, sub: '', project: '' });
  const [translated, setTranslated] = useState(false);
  const [origSnap, setOrigSnap] = useState<Minutes | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const noteFileRef = useRef<HTMLInputElement>(null);

  const resolvedId = activeId || params.get('m') || params.get('meeting') || meetings[0]?.id || '';
  const meeting = resolvedId ? meetings.find((m) => m.id === resolvedId) : null;

  useEffect(() => {
    if (!resolvedId) return;
    const m = allMeetings.find((x) => x.id === resolvedId);
    if (!m) return;
    let mn = allMinutes.find((x) => x.meetingId === resolvedId);
    if (!mn) {
      const transcript = transcripts.find((t) => t.meetingId === resolvedId);
      if (transcript) {
        const d = draftMinutesFromTranscript(transcript, m);
        mn = { ...emptyMinutes(resolvedId), callToOrder: d.callToOrder, previousMinutes: d.previousMinutes, agendaItems: d.agendaItems, adjournment: d.adjournment };
      } else {
        mn = emptyMinutes(resolvedId);
      }
    }
    setMin(JSON.parse(JSON.stringify(mn)));
    setHadLocked(!!mn.lockedAt);
  }, [resolvedId, dataReady]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !user || !dataReady) return null;

  const dept = meeting ? departments.find((d) => d.id === meeting.departmentId) : null;
  const chair = meeting ? users.find((u) => u.id === meeting.chairId) : null;
  const secretary = meeting ? users.find((u) => u.id === meeting.secretaryId) : null;
  const tasks = meeting ? allTasks.filter((t) => t.meetingId === meeting.id) : [];
  const isDefense = meeting?.meetingType === 'capstone' || meeting?.meetingType === 'research';
  const sigSec = min.signatures?.find((s) => s.userId === meeting?.secretaryId);
  const sigHead = min.signatures?.find((s) => s.userId === meeting?.chairId);

  // Save only the editable content fields (signatures/comments/lock go via RPCs).
  async function persistContent(m: Minutes): Promise<Minutes> {
    return saveMinutes({
      meetingId: resolvedId,
      documentTitle: m.documentTitle,
      callToOrder: m.callToOrder,
      previousMinutes: m.previousMinutes,
      agendaItems: m.agendaItems,
      actionItems: m.actionItems,
      adjournment: m.adjournment,
      paperNotes: m.paperNotes,
      translatedTo: m.translatedTo,
      motions: m.motions,
    });
  }
  async function ensureSavedId(): Promise<string | null> {
    if (min.id) return min.id;
    try {
      const saved = await persistContent(min);
      setMin((prev) => ({ ...prev, id: saved.id }));
      return saved.id;
    } catch {
      return null;
    }
  }

  function aiGenerate() {
    if (!meeting) return;
    const transcript = transcripts.find((t) => t.meetingId === meeting.id);
    if (!transcript) {
      toast('No transcript available for this meeting', 'error');
      return;
    }
    const d = draftMinutesFromTranscript(transcript, meeting);
    setMin((m) => ({ ...m, callToOrder: d.callToOrder, previousMinutes: d.previousMinutes, agendaItems: d.agendaItems, adjournment: d.adjournment }));
    toast('AI-generated draft loaded · review and edit as needed', 'ai');
    void logAudit('mom_ai_generated', meeting.title);
  }

  function updateAgenda(i: number, key: keyof AgendaItem, val: string) {
    setMin((m) => ({ ...m, agendaItems: (m.agendaItems || []).map((a, idx) => (idx === i ? { ...a, [key]: val } : a)) }));
  }
  function addAgenda() {
    setMin((m) => ({ ...m, agendaItems: [...(m.agendaItems || []), { title: 'New Agenda Item', notes: '' }] }));
  }
  function removeAgenda(i: number) {
    setMin((m) => ({ ...m, agendaItems: (m.agendaItems || []).filter((_, idx) => idx !== i) }));
  }
  // Motions & voting (rec #8)
  function addMotion() {
    setMin((m) => ({ ...m, motions: [...(m.motions || []), { id: uid('mo'), text: '', votesFor: 0, votesAgainst: 0, votesAbstain: 0, result: 'pending', ts: Date.now() } as Motion] }));
  }
  function updateMotion(i: number, patch: Partial<Motion>) {
    setMin((m) => ({ ...m, motions: (m.motions || []).map((mo, idx) => (idx === i ? { ...mo, ...patch } : mo)) }));
  }
  function removeMotion(i: number) {
    setMin((m) => ({ ...m, motions: (m.motions || []).filter((_, idx) => idx !== i) }));
  }

  async function doSign(dataUrl: string) {
    if (!meeting) return;
    const mid = await ensureSavedId();
    if (!mid) return toast('Could not save minutes', 'error');
    try {
      const signed = await signMinutes(mid, 'Faculty Secretary', dataUrl);
      if (signed) setMin(signed);
      void logAudit('minutes_signed', `Secretary signed: ${meeting.title}`);
      toast('Signed. Route to Head for final approval.', 'success');
      await refresh();
    } catch {
      toast('Could not sign the document', 'error');
    }
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!meeting || !commentText.trim()) return;
    const mid = await ensureSavedId();
    if (!mid) return toast('Could not save minutes', 'error');
    const c: Comment = { id: uid('c'), ts: Date.now(), userId: user!.id, name: user!.name, text: commentText.trim() };
    const next = [...(min.comments || []), c];
    try {
      await updateMinutesComments(mid, next);
    } catch {
      return toast('Could not post comment', 'error');
    }
    setMin((m) => ({ ...m, id: mid, comments: next }));
    void logAudit('comment_posted', `Minutes comment by ${user!.name} on ${meeting.title}`);
    if (meeting.chairId && meeting.chairId !== user!.id) void notifyUser(meeting.chairId, 'task', 'New comment on minutes', `${user!.name}: ${commentText.trim().slice(0, 80)}`);
    setCommentText('');
    toast('Comment posted.', 'success');
    await refresh();
  }

  async function saveAndRoute() {
    if (!meeting) return;
    try {
      // Editing a locked doc must reopen it (clears head signature) before saving.
      if (hadLocked && min.id) {
        await amendMinutes(min.id, 'Minutes edited after lock; re-approval required.');
      }
      // Snapshot this revision for the version history (rec #13).
      const version = {
        ts: Date.now(),
        byUserId: user!.id,
        byName: user!.name,
        label: hadLocked ? 'Amended & re-routed' : 'Routed for approval',
        snapshot: {
          documentTitle: min.documentTitle || docTitleFor(meeting),
          callToOrder: min.callToOrder,
          previousMinutes: min.previousMinutes,
          agendaItems: min.agendaItems,
          adjournment: min.adjournment,
          status: 'pending_approval',
        },
      };
      const saved = await persistContent({ ...min, documentTitle: docTitleFor(meeting), versions: [...(min.versions || []), version] });
      let finalMin = saved;
      if (!hadLocked) {
        const routed = await routeMinutesForApproval(saved.id); // sets pending + notifies chair
        if (routed) finalMin = routed;
      }
      setMin(finalMin);
      if (hadLocked) {
        void logAudit('minutes_amended', `${meeting.title} amended by ${user!.name}; Head re-approval needed.`);
        toast('Amendment saved. Head notified to re-approve.', 'info');
      } else {
        void logAudit('mom_routed', `${meeting.title} -> head for approval`);
        toast('Saved and routed to Head for approval', 'success');
      }
      setHadLocked(false);
      await refresh();
    } catch {
      toast('Could not save & route. The document may be locked.', 'error');
    }
  }

  async function exportDocx() {
    if (!meeting) return;
    try {
      await downloadMinutesDocx(
        {
          meeting: { title: meeting.title, date: fmtDate(meeting.date, true), venue: meeting.venue || '', department: dept?.name || '', chair: chair?.name || '', secretary: secretary?.name || '' },
          minutes: { documentTitle: min.documentTitle || docTitleFor(meeting), callToOrder: min.callToOrder, previousMinutes: min.previousMinutes, agendaItems: min.agendaItems, adjournment: min.adjournment },
          tasks: tasks.map((t) => ({ title: t.title, assignee: users.find((u) => u.id === t.assigneeId)?.name || 'Unassigned', deadline: t.deadline || '', status: String(t.status).replace('_', ' ') })),
          motions: (min.motions || []).map((m) => ({ text: m.text, result: m.result, votesFor: m.votesFor, votesAgainst: m.votesAgainst, votesAbstain: m.votesAbstain })),
        },
        fileNameFor(meeting),
      );
      void logAudit('minutes_exported', `${meeting.title} .docx`);
      toast('Minutes exported as .docx', 'success');
    } catch {
      toast('Export needs the server running with docx support.', 'error');
    }
  }

  function openPrePrint() {
    if (!meeting) {
      toast('Select a meeting first.', 'error');
      return;
    }
    setPp({ type: (meeting.meetingType as MeetingType) || 'regular', sub: meeting.subType || '', project: meeting.projectTitle || '' });
    setPpOpen(true);
  }
  async function confirmPrePrint() {
    if (!meeting) return;
    try {
      await updateMeetingFields(meeting.id, { meetingType: pp.type, subType: pp.sub, projectTitle: pp.project });
      const saved = await persistContent({ ...min, documentTitle: docTitleFor({ ...meeting, meetingType: pp.type, subType: pp.sub, projectTitle: pp.project }) });
      setMin(saved);
    } catch {
      /* printing can proceed even if the save failed */
    }
    const filename = fileNameFor({ ...meeting, meetingType: pp.type, subType: pp.sub, projectTitle: pp.project });
    const prevTitle = document.title;
    document.title = filename;
    setPpOpen(false);
    void logAudit('pre_print_confirmed', `${filename} for ${meeting.title}`);
    setTimeout(() => {
      window.print();
      setTimeout(() => (document.title = prevTitle), 500);
    }, 100);
    void refresh();
  }

  async function translateDoc() {
    if (translated) {
      if (origSnap) setMin(origSnap);
      setTranslated(false);
      return;
    }
    setOrigSnap(min);
    const tr = async (t: string) => {
      if (!t.trim()) return t;
      try {
        return await translateText(t, 'en-tl');
      } catch {
        return localTranslate(t, 'en-tl');
      }
    };
    const [call, prev, adj] = await Promise.all([tr(min.callToOrder || ''), tr(min.previousMinutes || ''), tr(min.adjournment || '')]);
    const agenda = await Promise.all((min.agendaItems || []).map(async (a) => ({ title: await tr(a.title), notes: await tr(a.notes) })));
    setMin((m) => ({ ...m, callToOrder: call, previousMinutes: prev, adjournment: adj, agendaItems: agenda }));
    setTranslated(true);
    toast('Document translated to Tagalog · editing paused until you show original', 'ai');
  }

  function handleNoteImage(file: File) {
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image of the handwritten notes.', 'error');
      return;
    }
    setOcrBusy(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      try {
        const notes = await readHandwrittenNotes(dataUrl);
        const paperNotes: PaperNote[] = [
          ...(min.paperNotes || []),
          ...notes.map((n) => ({ id: uid('pn'), pageOrPanel: n.pageOrPanel, note: n.note, source: 'handwritten', addedAt: Date.now() })),
        ];
        const saved = await persistContent({ ...min, paperNotes });
        setMin(saved);
        void logAudit('panel_notes_read', `${notes.length} handwritten notes for ${meeting?.title}`);
        toast(`Read ${notes.length} handwritten note(s) from the image.`, 'ai');
        await refresh();
      } catch {
        toast('Handwriting reading needs the AI service configured on the server. Image was not analyzed.', 'error');
      }
      setOcrBusy(false);
    };
    reader.readAsDataURL(file);
  }

  async function mergeNoteToComments(n: PaperNote) {
    const mid = await ensureSavedId();
    if (!mid) return toast('Could not save minutes', 'error');
    const c: Comment = { id: uid('c'), ts: Date.now(), userId: user!.id, name: `${user!.name} (from paper · ${n.pageOrPanel})`, text: n.note };
    const next = [...(min.comments || []), c];
    try {
      await updateMinutesComments(mid, next);
    } catch {
      return toast('Could not merge note', 'error');
    }
    setMin((m) => ({ ...m, id: mid, comments: next }));
    toast('Panel note merged into comments.', 'success');
    await refresh();
  }

  const ppSubOptions = pp.type === 'regular' ? [] : taxonomy[pp.type as 'capstone' | 'research'] || [];
  const ppFilename = meeting ? fileNameFor({ ...meeting, meetingType: pp.type, subType: pp.sub, projectTitle: pp.project }) : '—';
  const fieldCls = 'w-full p-sm border border-outline-variant rounded-lg focus:border-primary focus:ring-0';

  function SigBlock({ sig, person, role, canSign }: { sig?: Signature; person?: User | null; role: string; canSign: boolean }) {
    return (
      <div className="text-center">
        <div className="h-[80px] mb-xs flex items-end justify-center">
          {sig?.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sig.dataUrl} alt="signature" className="max-h-[70px]" />
          ) : canSign ? (
            <button onClick={() => setSignOpen(true)} className="no-print bg-surface border border-dashed border-primary text-primary px-md py-sm rounded-lg hover:bg-primary-fixed/20 flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px]">draw</span> Sign as Secretary
            </button>
          ) : (
            <span className="italic text-on-surface-variant text-body-sm">Awaiting Head&apos;s signature</span>
          )}
        </div>
        <div className="border-t border-on-surface-variant w-[80%] mx-auto pt-xs">
          <p className="font-body-md font-bold">{person ? person.name : '—'}</p>
          <p className="font-caption text-caption text-on-surface-variant">{role}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex items-center justify-between flex-wrap gap-md mb-lg no-print">
        <div>
          <h1 className="font-h1 text-h1">Meeting Document Editor</h1>
          <p className="font-body-md text-on-surface-variant">{meeting ? `${meeting.title} · ${fmtDate(meeting.date, true)}` : 'Pick a meeting to begin.'}</p>
        </div>
        <div className="flex gap-sm flex-wrap">
          <select value={resolvedId} onChange={(e) => setActiveId(e.target.value)} className="bg-surface-container border-transparent focus:border-primary rounded-lg py-sm px-md">
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          <button onClick={aiGenerate} className="bg-tertiary-container/20 border border-tertiary-container/30 text-tertiary-container px-md py-sm rounded-lg flex items-center gap-xs font-semibold">
            <span className="material-symbols-outlined text-[18px]">auto_awesome</span> AI Generate from Transcript
          </button>
          <button onClick={translateDoc} className="border border-tertiary-container/40 text-tertiary-container px-md py-sm rounded-lg hover:bg-tertiary-fixed/30 flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">translate</span> {translated ? 'Show Original' : 'Translate to Tagalog'}
          </button>
          <button onClick={() => noteFileRef.current?.click()} disabled={ocrBusy} className="border border-outline-variant px-md py-sm rounded-lg hover:bg-surface-container flex items-center gap-xs disabled:opacity-50">
            <span className="material-symbols-outlined text-[18px]">{ocrBusy ? 'hourglass_top' : 'photo_camera'}</span> {ocrBusy ? 'Reading…' : 'Read Panel Notes'}
          </button>
          <input ref={noteFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleNoteImage(f); e.target.value = ''; }} />
          <button onClick={exportDocx} className="border border-outline-variant px-md py-sm rounded-lg hover:bg-surface-container flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">description</span> .docx
          </button>
          <button onClick={openPrePrint} className="border border-outline-variant px-md py-sm rounded-lg hover:bg-surface-container flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">print</span> Print/PDF
          </button>
          <button onClick={saveAndRoute} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">send</span> Save &amp; Route
          </button>
        </div>
      </header>

      {min.lockedAt ? (
        <div className="amend-banner mb-md no-print">
          <span className="material-symbols-outlined">edit_note</span>
          <div>
            <p className="font-semibold">This document is locked by the Head&apos;s approval.</p>
            <p className="font-caption text-caption">Saving any change will clear the Head&apos;s signature, revert status to pending, and notify them to re-approve. Every amendment is recorded.</p>
          </div>
        </div>
      ) : null}
      {(min.amendments || []).length ? (
        <details className="bg-surface-container-low border border-outline-variant rounded-lg p-md mb-md no-print">
          <summary className="cursor-pointer font-semibold flex items-center gap-sm">
            <span className="material-symbols-outlined text-tertiary">history_edu</span> Amendment History ({min.amendments!.length})
          </summary>
          <ul className="mt-sm space-y-xs">
            {min.amendments!.slice().reverse().map((a, i) => (
              <li key={i} className="text-body-sm">
                <span className="font-semibold">{a.byName || a.byUserId}</span>
                <span className="text-on-surface-variant"> · {fmtDate(a.ts, true)}</span>
                <p className="text-on-surface-variant ml-md">{a.summary}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {(min.versions || []).length ? (
        <details className="bg-surface-container-low border border-outline-variant rounded-lg p-md mb-md no-print">
          <summary className="cursor-pointer font-semibold flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary">history</span> Version History ({min.versions!.length})
          </summary>
          <ol className="mt-sm space-y-xs">
            {min.versions!.slice().reverse().map((v, i) => (
              <li key={i} className="text-body-sm flex items-baseline gap-sm">
                <span className="font-label-caps text-label-caps text-primary shrink-0">v{min.versions!.length - i}</span>
                <span className="font-semibold">{v.label}</span>
                <span className="text-on-surface-variant">· {v.byName} · {fmtDate(v.ts, true)}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      <div className="ched-doc">
        <div className="text-center border-b-2 border-primary pb-md mb-lg">
          <div className="w-16 h-16 mx-auto mb-sm rounded-full bg-primary text-on-primary flex items-center justify-center shadow-primary-md">
            <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance</span>
          </div>
          <p className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mb-xs">Zamboanga Peninsula Polytechnic State University</p>
          <h2 className="font-h2 text-h2 text-primary font-bold">{dept ? dept.name.toUpperCase() : '—'}</h2>
          <h1 className="font-h1 text-h1 mt-sm">{min.documentTitle || (meeting ? docTitleFor(meeting) : 'Minutes of the Meeting')}</h1>
          <h3 className="font-h3 text-h3 text-on-surface-variant mt-xs">{meeting?.title || '—'}</h3>
        </div>

        <div className="grid grid-cols-2 gap-md mb-md text-body-md">
          <p><strong className="text-on-surface-variant">Date:</strong> {meeting ? fmtDate(meeting.date, true) : '—'}</p>
          <p><strong className="text-on-surface-variant">Venue:</strong> {meeting?.venue || '—'}</p>
          <p><strong className="text-on-surface-variant">Presiding Officer:</strong> {chair ? chair.name : '—'}</p>
          <p><strong className="text-on-surface-variant">Secretary:</strong> {secretary ? secretary.name : '—'}</p>
        </div>

        {isDefense && meeting ? (
          <div className="mb-xl bg-tertiary-fixed/30 border border-tertiary-container/40 rounded-lg p-md">
            <p className="font-label-caps text-label-caps text-tertiary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px]">school</span> {meeting.meetingType === 'capstone' ? 'Capstone' : 'Research'} Defense Details
            </p>
            <div className="grid grid-cols-2 gap-md text-body-sm">
              <p><strong className="text-on-surface-variant">Project Title:</strong> {meeting.projectTitle || '—'}</p>
              <p><strong className="text-on-surface-variant">Sub-Type:</strong> {meeting.subType || '—'}</p>
              {meeting.meetingType === 'capstone' ? <p><strong className="text-on-surface-variant">Chairperson:</strong> {users.find((u) => u.id === meeting.chairpersonId)?.name || '—'}</p> : null}
              <p><strong className="text-on-surface-variant">Adviser:</strong> {users.find((u) => u.id === meeting.adviserId)?.name || '—'}</p>
              {meeting.meetingType === 'capstone' ? <p className="col-span-2"><strong className="text-on-surface-variant">Panel Members:</strong> {(meeting.panelMemberIds || []).map((id) => users.find((u) => u.id === id)?.name || '—').join(', ') || '—'}</p> : null}
            </div>
          </div>
        ) : null}

        <section className="mb-lg">
          <h3 className="font-h3 text-h3 text-primary mb-sm flex items-center gap-sm"><span className="material-symbols-outlined text-outline">gavel</span> 1. Call to Order &amp; Attendance</h3>
          <textarea rows={3} readOnly={translated} className={fieldCls} value={min.callToOrder || ''} onChange={(e) => setMin({ ...min, callToOrder: e.target.value })} />
        </section>
        <section className="mb-lg">
          <h3 className="font-h3 text-h3 text-primary mb-sm flex items-center gap-sm"><span className="material-symbols-outlined text-outline">history</span> 2. Approval of Previous Minutes</h3>
          <textarea rows={3} readOnly={translated} className={fieldCls} value={min.previousMinutes || ''} onChange={(e) => setMin({ ...min, previousMinutes: e.target.value })} />
        </section>

        <section className="mb-xl">
          <div className="flex items-center justify-between mb-md">
            <h3 className="font-h3 text-h3 text-primary flex items-center gap-sm"><span className="material-symbols-outlined text-outline">list_alt</span> 3. Agenda Items &amp; Discussions</h3>
            <button onClick={addAgenda} className="no-print text-primary hover:underline font-label-caps text-label-caps flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px]">add</span> Add Item
            </button>
          </div>
          <div className="space-y-md">
            {(min.agendaItems || []).length === 0 ? (
              <p className="text-on-surface-variant italic">No agenda items yet. Add one above.</p>
            ) : (
              (min.agendaItems || []).map((a, i) => (
                <div key={i} className="glass-panel border-l-4 border-l-tertiary-container rounded-r-lg p-md relative">
                  <button onClick={() => removeAgenda(i)} className="no-print absolute top-sm right-sm text-on-surface-variant hover:text-error">
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                  <div className="flex items-center gap-sm mb-xs">
                    <input readOnly={translated} className="font-body-lg font-semibold bg-transparent border-0 focus:bg-surface-container-low focus:ring-1 focus:ring-primary rounded px-xs flex-1" value={a.title} onChange={(e) => updateAgenda(i, 'title', e.target.value)} />
                    <span className="ai-badge no-print">AI Summarized</span>
                  </div>
                  <textarea rows={3} readOnly={translated} className="w-full bg-transparent border-0 focus:bg-surface-container-low focus:ring-1 focus:ring-primary rounded p-sm" value={a.notes} onChange={(e) => updateAgenda(i, 'notes', e.target.value)} />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mb-xl">
          <h3 className="font-h3 text-h3 text-primary mb-md flex items-center gap-sm"><span className="material-symbols-outlined text-outline">assignment_turned_in</span> 4. Action Items</h3>
          <table className="w-full text-left text-body-sm">
            <thead>
              <tr className="border-b-2 border-outline-variant text-on-surface-variant font-label-caps text-label-caps uppercase">
                <th className="py-sm px-md">Task</th>
                <th className="py-sm px-md">Assignee</th>
                <th className="py-sm px-md">Deadline</th>
                <th className="py-sm px-md">Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan={4} className="py-md text-center text-on-surface-variant">No action items.</td></tr>
              ) : (
                tasks.map((t) => {
                  const a = users.find((u) => u.id === t.assigneeId);
                  const pill = t.status === 'done' ? 'pill-done' : t.status === 'in_progress' ? 'pill-progress' : 'pill-pending';
                  return (
                    <tr key={t.id} className="border-b border-outline-variant/50">
                      <td className="py-sm px-md">{t.title}</td>
                      <td className="py-sm px-md">{a ? a.name : <em className="text-on-surface-variant">Unassigned</em>}</td>
                      <td className="py-sm px-md">{t.deadline || '—'}</td>
                      <td className="py-sm px-md"><span className={`pill ${pill}`}>{t.status.replace('_', ' ')}</span></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        <section className="mb-xl">
          <div className="flex items-center justify-between mb-md">
            <h3 className="font-h3 text-h3 text-primary flex items-center gap-sm"><span className="material-symbols-outlined text-outline">how_to_vote</span> 5. Motions &amp; Voting</h3>
            <button onClick={addMotion} className="no-print text-primary hover:underline font-label-caps text-label-caps flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px]">add</span> Add Motion
            </button>
          </div>
          <div className="space-y-md">
            {(min.motions || []).length === 0 ? (
              <p className="text-on-surface-variant italic">No motions recorded.</p>
            ) : (
              (min.motions || []).map((mo, i) => {
                const resultCls = mo.result === 'carried' ? 'pill-done' : mo.result === 'failed' ? 'pill-overdue' : 'pill-pending';
                return (
                  <div key={mo.id} className="glass-panel border-l-4 border-l-primary rounded-r-lg p-md relative">
                    <button onClick={() => removeMotion(i)} className="no-print absolute top-sm right-sm text-on-surface-variant hover:text-error">
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                    <span className={`pill ${resultCls} print:hidden mb-xs inline-block capitalize`}>{mo.result}</span>
                    <textarea rows={2} className="w-full bg-transparent border-0 focus:bg-surface-container-low focus:ring-1 focus:ring-primary rounded p-sm font-body-md" placeholder="Motion moved by … : that …" value={mo.text} onChange={(e) => updateMotion(i, { text: e.target.value })} />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-sm mt-sm no-print">
                      {(['votesFor', 'votesAgainst', 'votesAbstain'] as const).map((k) => (
                        <label key={k} className="font-caption text-caption text-on-surface-variant">
                          {k === 'votesFor' ? 'For' : k === 'votesAgainst' ? 'Against' : 'Abstain'}
                          <input type="number" min={0} value={mo[k]} onChange={(e) => updateMotion(i, { [k]: parseInt(e.target.value, 10) || 0 } as Partial<Motion>)} className="w-full mt-xs px-sm py-xs rounded-lg bg-surface-container-low border border-outline-variant" />
                        </label>
                      ))}
                      <label className="font-caption text-caption text-on-surface-variant">
                        Result
                        <select value={mo.result} onChange={(e) => updateMotion(i, { result: e.target.value as Motion['result'] })} className="w-full mt-xs px-sm py-xs rounded-lg bg-surface-container-low border border-outline-variant">
                          <option value="pending">Pending</option>
                          <option value="carried">Carried</option>
                          <option value="failed">Failed</option>
                          <option value="tabled">Tabled</option>
                        </select>
                      </label>
                    </div>
                    <p className="hidden print:block font-caption text-caption text-on-surface-variant mt-xs">
                      Result: {mo.result} — For {mo.votesFor}, Against {mo.votesAgainst}, Abstain {mo.votesAbstain}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="mb-lg">
          <h3 className="font-h3 text-h3 text-primary mb-sm">6. Adjournment</h3>
          <textarea rows={2} readOnly={translated} className={fieldCls} value={min.adjournment || ''} onChange={(e) => setMin({ ...min, adjournment: e.target.value })} />
        </section>

        <section className="mt-xxl pt-lg border-t border-outline-variant grid grid-cols-1 md:grid-cols-2 gap-xl">
          <SigBlock sig={sigSec} person={secretary} role="Faculty Secretary" canSign={true} />
          <SigBlock sig={sigHead} person={chair} role="Presiding Officer / Dean" canSign={false} />
        </section>
      </div>

      <section className="comments-panel mt-lg bg-surface-container-lowest border border-outline-variant rounded-xl p-md no-print">
        <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm"><span className="material-symbols-outlined text-primary">forum</span> Comments on this document</h3>
        <div className="space-y-sm mb-md">
          {(min.comments || []).length === 0 ? (
            <p className="text-on-surface-variant italic">No comments yet.</p>
          ) : (
            (min.comments || []).map((c) => {
              const u = users.find((x) => x.id === c.userId);
              return (
                <div key={c.id} className="comment flex gap-sm">
                  <Avatar user={u || { name: c.name }} size="w-9 h-9 text-[12px]" />
                  <div className="flex-1">
                    <div className="flex items-baseline gap-sm">
                      <p className="font-body-sm font-semibold">{c.name}</p>
                      <p className="font-caption text-caption text-on-surface-variant">{fmtDate(c.ts, true)}</p>
                    </div>
                    <p className="font-body-sm">{c.text}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <form onSubmit={postComment} className="flex gap-sm">
          <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment for the panel / approvers..." className="flex-1 px-md py-sm rounded-lg bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0" required />
          <button type="submit" className="px-md py-sm rounded-lg bg-primary text-on-primary shadow-primary-md font-label-caps text-label-caps">Post</button>
        </form>
      </section>

      {(min.paperNotes || []).length ? (
        <section className="mt-lg bg-surface-container-lowest border border-tertiary-container/40 rounded-xl p-md no-print">
          <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
            <span className="material-symbols-outlined text-tertiary-container">gesture</span> Panel Notes (from paper)
            <span className="ai-badge">handwriting AI</span>
          </h3>
          <p className="font-caption text-caption text-on-surface-variant mb-sm">
            Handwritten notes read from an uploaded photo, kept separate from the audio so nothing is lost. Merge any into the document comments.
          </p>
          <div className="space-y-sm">
            {(min.paperNotes || []).map((n) => (
              <div key={n.id} className="p-sm bg-tertiary-fixed/30 rounded-lg border-l-4 border-tertiary-container flex items-start gap-sm">
                <div className="flex-1">
                  <p className="font-label-caps text-label-caps text-tertiary">{n.pageOrPanel}</p>
                  <p className="font-body-sm whitespace-pre-wrap">{n.note}</p>
                </div>
                <button onClick={() => mergeNoteToComments(n)} className="text-primary hover:underline font-label-caps text-label-caps shrink-0 flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[16px]">forum</span> Merge
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {ppOpen ? (
        <div className="pre-print-modal">
          <div className="pre-print-card">
            <h3 className="font-h3 text-h3 mb-sm flex items-center gap-sm"><span className="material-symbols-outlined text-primary">description</span> Confirm Document Type</h3>
            <p className="font-body-sm text-on-surface-variant mb-md">Confirm the meeting / document type and sub-type so the printed title and filename are accurate.</p>
            <div className="grid grid-cols-2 gap-md mb-md">
              <div>
                <label className="font-label-caps text-label-caps">Meeting Type</label>
                <select value={pp.type} onChange={(e) => setPp({ ...pp, type: e.target.value as MeetingType, sub: '' })} className="w-full px-md py-sm rounded-lg bg-surface-container-low border-2 border-transparent focus:border-primary mt-xs">
                  <option value="regular">Regular</option>
                  <option value="capstone">Capstone</option>
                  <option value="research">Research</option>
                </select>
              </div>
              {pp.type !== 'regular' ? (
                <div>
                  <label className="font-label-caps text-label-caps">Sub-Type</label>
                  <select value={pp.sub} onChange={(e) => setPp({ ...pp, sub: e.target.value })} className="w-full px-md py-sm rounded-lg bg-surface-container-low border-2 border-transparent focus:border-primary mt-xs">
                    <option value="">—</option>
                    {ppSubOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            {pp.type !== 'regular' ? (
              <div>
                <label className="font-label-caps text-label-caps">Project Title (for filename)</label>
                <input value={pp.project} onChange={(e) => setPp({ ...pp, project: e.target.value })} className="w-full px-md py-sm rounded-lg bg-surface-container-low border-2 border-transparent focus:border-primary mt-xs" />
              </div>
            ) : null}
            <div className="mt-md bg-surface-container-low border border-outline-variant rounded-lg p-sm">
              <p className="font-label-caps text-label-caps text-on-surface-variant">Filename preview</p>
              <p className="font-body-md font-semibold break-all">{ppFilename}</p>
            </div>
            <div className="flex justify-end gap-sm mt-md">
              <button type="button" onClick={() => setPpOpen(false)} className="px-md py-sm rounded-lg border border-outline-variant">Cancel</button>
              <button type="button" onClick={confirmPrePrint} className="px-md py-sm rounded-lg bg-primary text-on-primary shadow-primary-md flex items-center gap-xs">
                <span className="material-symbols-outlined text-[18px]">print</span> Print
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SignModal open={signOpen} onClose={() => setSignOpen(false)} title="Sign as Secretary" subtitle="Your signature certifies you prepared this document." onConfirm={doSign} />
    </div>
  );
}

export default function SecretaryMomEditor() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
