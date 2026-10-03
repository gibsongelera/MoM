'use client';

/**
 * Minutes of the Meeting editor — CHED format.
 *
 * The body follows the order of business of CHED Administrative Order
 * No. 06, s. 2014 (src/lib/minutes/ched.ts): I. Preliminaries (A–G),
 * II. New Business (matters for approval by category), III. Matters for
 * Confirmation, IV. Other Matters, V. Adjournment — on a ZPPSU + CHED
 * letterhead, with the matrix of action items as Annex A. "Download PDF" and
 * "Download Word" produce the same document (/api/minutes/[id]/export).
 *
 * Workflow state is unchanged: the lock/amend sequence is one call to
 * amend_minutes(), routing is route_minutes_for_approval(), signing is
 * sign_minutes() (all SECURITY DEFINER, 0003/0011/0015). Storage stays
 * backward compatible (call_to_order / previous_minutes / adjournment
 * columns + sectioned agenda_items), so older minutes open in this editor.
 *
 * ai_action_items (staged on the minutes row by transcription) are Claude's
 * free-text extraction; "Convert to task" turns one into a real tasks row
 * with a real assignee and date.
 */
import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { docTitleFor } from '@/lib/ai/doc-title';
import type { MeetingType } from '@/lib/types/domain';
import type { PaperNote } from '@/lib/meetings/printable';
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  LETTERHEAD,
  PRELIMINARY,
  joinMinutes,
  splitMinutes,
  type BusinessItem,
  type ChedCategory,
  type ChedMinutes,
  type MinutesItem,
  type PreliminaryField,
} from '@/lib/minutes/ched';
import { fmtManila, fmtManilaTime } from '@/lib/utils/datetime';
import { humanize } from '@/lib/ui/status';
import { cn } from '@/lib/ui/cn';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import SignaturePad from './SignaturePad';

export interface MeetingDetail {
  id: string;
  title: string;
  starts_at: string;
  venue: string | null;
  meeting_type: MeetingType;
  sub_type: string | null;
  project_title: string | null;
  departmentName: string | null;
  /** Converted tasks need it, or the head never sees them (tasks RLS is by department). */
  departmentId: string | null;
  chairId: string | null;
  chairName: string | null;
  secretaryId: string | null;
  secretaryName: string | null;
  chairpersonName: string | null;
  adviserName: string | null;
  panelNames: string[];
}

export type AgendaItem = MinutesItem;
export interface Signature {
  userId: string;
  name: string;
  role: string;
  signedAt: number;
  dataUrl: string;
}
export interface Amendment {
  ts: number;
  byUserId: string;
  byName: string;
  summary: string;
}
export interface ThreadComment {
  id: string;
  ts: number;
  userId: string | null;
  name: string;
  text: string;
}
export interface ExtractedActionItem {
  text: string;
  assignee: string;
  deadline: string;
  confidence: number;
}

export interface MinutesDetail {
  id: string | null;
  call_to_order: string;
  previous_minutes: string;
  agenda_items: AgendaItem[];
  adjournment: string;
  ai_action_items: ExtractedActionItem[];
  signatures: Signature[];
  comments: ThreadComment[];
  amendments: Amendment[];
  status: string;
  locked_at: string | null;
  paper_notes: PaperNote[];
}

/** A photographed page of handwritten panel notes (meeting_attachments, kind panel_notes). */
export interface PanelNotesPhoto {
  id: string;
  file_name: string;
  caption: string | null;
  url: string | null;
}

export interface AssignedTask {
  id: string;
  title: string;
  assignee_name: string | null;
  deadline: string | null;
  status: string;
}

export interface TeamMember {
  id: string;
  name: string;
}

type ListKey = 'newBusiness' | 'confirmation' | 'other';

function emptyMinutes(): MinutesDetail {
  return {
    id: null,
    call_to_order: '',
    previous_minutes: '',
    agenda_items: [],
    adjournment: '',
    ai_action_items: [],
    signatures: [],
    comments: [],
    amendments: [],
    status: 'draft',
    locked_at: null,
    paper_notes: [],
  };
}

const fieldClass =
  'w-full rounded-md border border-outline bg-white px-sm py-xs font-[Arial,Helvetica,sans-serif] text-[10.5pt] leading-snug text-black ' +
  'placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-1 focus:ring-primary';

export default function MomEditor({
  meeting,
  initialMinutes,
  tasks,
  team,
  currentUserId,
  currentUserName,
  panelPhotos = [],
}: {
  meeting: MeetingDetail;
  initialMinutes: MinutesDetail | null;
  tasks: AssignedTask[];
  team: TeamMember[];
  currentUserId: string;
  currentUserName: string;
  panelPhotos?: PanelNotesPhoto[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [printPrompt, setPrintPrompt] = useState(false);
  const [readingPhotoId, setReadingPhotoId] = useState<string | null>(null);

  const [minutes, setMinutes] = useState<MinutesDetail>(initialMinutes ?? emptyMinutes());
  const [ched, setChed] = useState<ChedMinutes>(() => splitMinutes(initialMinutes ?? {}));
  const [savedBody, setSavedBody] = useState(() => JSON.stringify(joinMinutes(splitMinutes(initialMinutes ?? {}))));
  const dirty = JSON.stringify(joinMinutes(ched)) !== savedBody || !minutes.id;
  const wasLocked = Boolean(initialMinutes?.locked_at);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);
  const [signing, setSigning] = useState(false);
  const [signatureDraft, setSignatureDraft] = useState<string | null>(null);
  const [showSignPad, setShowSignPad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [convertingIndex, setConvertingIndex] = useState<number | null>(null);
  const [convertAssignee, setConvertAssignee] = useState('');
  const [convertDeadline, setConvertDeadline] = useState('');

  const docTitle = docTitleFor(meeting);
  const mySignature = minutes.signatures.find((s) => s.userId === currentUserId);
  const headSignature = minutes.signatures.find((s) => s.userId === meeting.chairId);

  // ---- body editing -------------------------------------------------------
  const setPrelim = (field: PreliminaryField, value: string) => setChed((c) => ({ ...c, preliminary: { ...c.preliminary, [field]: value } }));
  const updateItem = (list: ListKey, i: number, patch: Partial<BusinessItem>) =>
    setChed((c) => ({ ...c, [list]: c[list].map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));
  const addItem = (list: ListKey) =>
    setChed((c) => ({ ...c, [list]: [...c[list], { title: '', notes: '', action: '', category: list === 'newBusiness' ? 'academic' : null }] }));
  const removeItem = (list: ListKey, i: number) => setChed((c) => ({ ...c, [list]: c[list].filter((_, idx) => idx !== i) }));
  const moveItem = (list: ListKey, i: number, dir: -1 | 1) =>
    setChed((c) => {
      const next = [...c[list]];
      const j = i + dir;
      if (j < 0 || j >= next.length) return c;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...c, [list]: next };
    });

  /**
   * Inserts the row on first save, updates it thereafter. Returns the minutes id.
   *
   * A locked row can't be written this way at all - minutes_update's RLS
   * policy requires locked_at is null, so the .update() below would silently
   * match zero rows. Callers that need to touch a locked document (amending)
   * go through amend_minutes() instead; skip the no-op update here rather
   * than have it look like it succeeded.
   */
  async function ensureSaved(): Promise<string> {
    if (minutes.id && wasLocked) return minutes.id;
    const body = joinMinutes(ched);
    const payload = { meeting_id: meeting.id, document_title: docTitle, ...body };
    if (minutes.id) {
      const { data, error: updateError } = await supabase.from('minutes').update(payload).eq('id', minutes.id).select('id');
      if (updateError) throw updateError;
      if (!data?.length) throw new Error('These minutes are locked or no longer editable. Reload the page.');
      setSavedBody(JSON.stringify(body));
      return minutes.id;
    }
    const { data, error: insertError } = await supabase.from('minutes').insert(payload).select('id').single();
    if (insertError) throw insertError;
    setMinutes((m) => ({ ...m, id: data.id }));
    setSavedBody(JSON.stringify(body));
    return data.id;
  }

  async function handleSign(e: FormEvent) {
    e.preventDefault();
    if (!signatureDraft) {
      setError('Draw your signature first.');
      return;
    }
    setSigning(true);
    setError(null);
    try {
      const id = await ensureSaved();
      const { data, error: signError } = await supabase.rpc('sign_minutes', {
        p_minutes_id: id,
        p_role_label: 'Secretary',
        p_data_url: signatureDraft,
      });
      if (signError) throw signError;
      if (data) setMinutes((m) => ({ ...m, signatures: data.signatures }));
      setShowSignPad(false);
      setSignatureDraft(null);
      setNotice('Signed. Save and route to send this to the Head for approval.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign.');
    } finally {
      setSigning(false);
    }
  }

  /** Saves the body without routing it for approval (client: save, then print now or later). */
  async function handleSaveDraft() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await ensureSaved();
      setNotice('Draft saved.');
      setPrintPrompt(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  /** PDF / Word download of the saved document; unsaved edits are saved first (never on a locked record). */
  async function download(format: 'pdf' | 'docx') {
    setExporting(format);
    setError(null);
    try {
      if (!minutes.id || (dirty && !wasLocked)) await ensureSaved();
      if (dirty && wasLocked) toast.info('Downloading the approved version. Your unsaved amendment is not in the file until you save and route it.');
      const a = document.createElement('a');
      a.href = `/api/minutes/${meeting.id}/export?format=${format}`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(format === 'pdf' ? 'Preparing the PDF download…' : 'Preparing the Word download…');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare the download.');
    } finally {
      setExporting(null);
    }
  }

  /** Reads one photographed page of panel notes with AI and keeps the text with the minutes. */
  async function readPanelNotes(photo: PanelNotesPhoto) {
    setReadingPhotoId(photo.id);
    setError(null);
    try {
      const res = await fetch('/api/ai/read-notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attachmentId: photo.id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'The notes could not be read.');
      const read = ((body?.notes ?? []) as { pageOrPanel?: string; note: string }[]).map((n) => ({
        id: crypto.randomUUID(),
        attachmentId: photo.id,
        pageOrPanel: n.pageOrPanel ?? null,
        note: n.note,
        readAt: Date.now(),
      }));
      if (read.length === 0) throw new Error('No handwriting was found in that photo.');
      const id = await ensureSaved();
      const next = [...minutes.paper_notes.filter((n) => n.attachmentId !== photo.id), ...read];
      const { data, error: updateError } = await supabase.from('minutes').update({ paper_notes: next }).eq('id', id).select('id');
      if (updateError) throw updateError;
      if (!data?.length) throw new Error('These minutes are locked. Amend them before adding notes.');
      setMinutes((m) => ({ ...m, paper_notes: next }));
      toast.success(`Read ${read.length} note${read.length === 1 ? '' : 's'} from ${photo.caption || photo.file_name}. The photo is kept as evidence.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The notes could not be read.');
    } finally {
      setReadingPhotoId(null);
    }
  }

  async function handleSaveAndRoute() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (wasLocked) {
        // RLS blocks direct writes to a locked minutes row (minutes_update
        // requires locked_at is null), so the edited body has to travel
        // through amend_minutes() itself rather than a plain table update -
        // otherwise it silently no-ops and the edits are lost.
        const body = joinMinutes(ched);
        const { data, error: amendError } = await supabase.rpc('amend_minutes', {
          p_minutes_id: minutes.id,
          p_summary: 'Minutes edited after lock; re-approval required.',
          p_call_to_order: body.call_to_order,
          p_previous_minutes: body.previous_minutes,
          p_agenda_items: body.agenda_items,
          p_adjournment: body.adjournment,
        });
        if (amendError) throw amendError;
        if (data) setMinutes((m) => ({ ...m, ...data }));
        setSavedBody(JSON.stringify(body));
        setNotice('Amendment saved. The Head has been notified to re-approve.');
      } else {
        const id = await ensureSaved();
        const { data, error: routeError } = await supabase.rpc('route_minutes_for_approval', { p_minutes_id: id });
        if (routeError) throw routeError;
        if (data) setMinutes((m) => ({ ...m, ...data }));
        setNotice('Saved and routed to the Head for approval.');
      }
      setPrintPrompt(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function postComment(e: FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setPostingComment(true);
    setError(null);
    try {
      const id = await ensureSaved();
      const { data, error: rpcError } = await supabase.rpc('append_minutes_comment', {
        p_minutes_id: id,
        p_text: commentText.trim(),
      });
      if (rpcError) throw rpcError;
      if (data) setMinutes((m) => ({ ...m, comments: data as ThreadComment[] }));
      setCommentText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post comment.');
    } finally {
      setPostingComment(false);
    }
  }

  async function convertActionItem(index: number) {
    const item = minutes.ai_action_items[index];
    if (!convertAssignee) {
      setError('Choose who this is assigned to.');
      return;
    }
    setError(null);
    const { error: insertError } = await supabase.from('tasks').insert({
      title: item.text,
      meeting_id: meeting.id,
      department_id: meeting.departmentId,
      assignee_id: convertAssignee,
      delegated_by: currentUserId,
      deadline: convertDeadline || null,
      status: 'pending',
      ai_extracted: true,
      confidence: item.confidence,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    const remaining = minutes.ai_action_items.filter((_, i) => i !== index);
    const id = minutes.id ?? (await ensureSaved());
    const { error: stageError } = await supabase.from('minutes').update({ ai_action_items: remaining }).eq('id', id);
    if (stageError) setError(`The task was created, but the suggestion couldn't be cleared: ${stageError.message}`);
    setMinutes((m) => ({ ...m, ai_action_items: remaining }));
    setConvertingIndex(null);
    setConvertAssignee('');
    setConvertDeadline('');
    router.refresh();
  }

  const meta: [string, string][] = [
    ['Subject', docTitle],
    ['Date', fmtManila(meeting.starts_at, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
    ['Time', fmtManilaTime(meeting.starts_at)],
    ['Venue', meeting.venue ?? '—'],
    ['Presiding', meeting.chairName ?? '—'],
    ['Secretary', meeting.secretaryName ?? currentUserName],
  ];
  if (meeting.meeting_type !== 'regular') {
    meta.push([meeting.meeting_type === 'capstone' ? 'Capstone' : 'Research', meeting.sub_type ?? '—']);
    if (meeting.project_title) meta.push(['Project', meeting.project_title]);
    if (meeting.meeting_type === 'capstone' && meeting.chairpersonName) meta.push(['Chairperson', meeting.chairpersonName]);
    if (meeting.meeting_type === 'capstone' && meeting.panelNames.length) meta.push(['Panel', meeting.panelNames.join('; ')]);
    if (meeting.adviserName) meta.push(['Adviser', meeting.adviserName]);
  }

  return (
    <>
      <div className="no-print mb-lg flex flex-wrap items-center justify-between gap-md">
        <div>
          <h1 className="font-h1 text-h1">Minutes editor</h1>
          <p className="font-body-md text-on-surface-variant">
            {meeting.title} · {fmtManila(meeting.starts_at)} · CHED format (AO No. 06, s. 2014)
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <a href={`/print/meetings/${meeting.id}`} target="_blank" rel="noreferrer" className={buttonClasses('secondary', 'md', 'pl-sm')}>
            <Icon name="print" size={18} /> Preview and print
          </a>
          <Button variant="secondary" icon="picture_as_pdf" onClick={() => download('pdf')} loading={exporting === 'pdf'} disabled={exporting !== null}>
            Download PDF
          </Button>
          <Button variant="secondary" icon="description" onClick={() => download('docx')} loading={exporting === 'docx'} disabled={exporting !== null}>
            Download Word
          </Button>
          <Button
            variant="secondary"
            icon="save"
            onClick={handleSaveDraft}
            disabled={saving || wasLocked}
            title={wasLocked ? 'Approved minutes change only through “Save and route” (an amendment).' : undefined}
          >
            Save draft
          </Button>
          <Button icon="send" onClick={handleSaveAndRoute} loading={saving}>
            Save and route for approval
          </Button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="no-print mb-md rounded-lg bg-error-container p-sm font-body-sm text-on-error-container">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="no-print mb-md rounded-lg bg-success-container p-sm font-body-sm text-on-success-container">
          {notice}
        </div>
      ) : null}
      {dirty && minutes.id ? (
        <p className="no-print mb-md inline-flex items-center gap-xs rounded-full bg-tertiary-fixed/50 px-sm py-xs font-caption text-caption text-on-tertiary-fixed-variant" role="status">
          <Icon name="edit" size={14} /> Unsaved changes
        </p>
      ) : null}

      {minutes.locked_at ? (
        <div className="amend-banner no-print mb-md">
          <Icon name="edit_note" />
          <div>
            <p className="font-semibold">This document is locked by the Head&apos;s approval.</p>
            <p className="font-caption text-caption">
              Saving any change will clear the Head&apos;s signature, revert status to pending approval, and notify them to re-approve. Every amendment is
              recorded.
            </p>
          </div>
        </div>
      ) : null}

      {minutes.amendments.length > 0 ? (
        <details className="no-print mb-md rounded-lg border border-outline-variant bg-surface-container-low p-md">
          <summary className="flex cursor-pointer items-center gap-sm font-semibold">
            <Icon name="history_edu" className="text-tertiary" /> Amendment history ({minutes.amendments.length})
          </summary>
          <ul className="mt-sm space-y-xs">
            {[...minutes.amendments].reverse().map((a, i) => (
              <li key={i} className="text-body-sm">
                <span className="font-semibold">{a.byName}</span>
                <span className="text-on-surface-variant"> · {fmtManila(new Date(a.ts).toISOString())}</span>
                <p className="ml-md text-on-surface-variant">{a.summary}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="ched-doc ched-paper text-[10.5pt] leading-snug text-black">
        {/* Letterhead (a div: the print stylesheet hides <header> elements) */}
        <div className="flex items-center justify-between gap-md border-b-[3px] border-double border-primary pb-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- document letterhead, same asset as the PDF/Word export */}
          <img src={LETTERHEAD.zppsuLogo} alt="ZPPSU seal" className="h-[76px] w-[76px] shrink-0 object-contain" />
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[10pt]">{LETTERHEAD.republic}</p>
            <p className="text-[12.5pt] font-bold uppercase leading-tight text-primary">{LETTERHEAD.university}</p>
            <p className="text-[9pt] text-[#333]">{LETTERHEAD.address}</p>
            {meeting.departmentName ? <p className="mt-[2px] text-[10.5pt] font-bold uppercase">{meeting.departmentName}</p> : null}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- document letterhead, same asset as the PDF/Word export */}
          <img src={LETTERHEAD.chedLogo} alt="Commission on Higher Education seal" className="h-[76px] w-[76px] shrink-0 object-contain" />
        </div>

        <h2 className="mt-md text-[12.5pt] font-bold uppercase">Minutes of the Meeting</h2>
        <table className="mt-xs w-full border-collapse">
          <tbody>
            {meta.map(([label, value]) => (
              <tr key={label} className="align-top">
                <th scope="row" className="w-[118px] py-[1px] pr-sm text-left font-normal uppercase">
                  {label}
                </th>
                <td className="w-[14px] py-[1px]">:</td>
                <td className={cn('py-[1px]', label === 'Subject' && 'font-bold uppercase')}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="no-print mt-xs font-caption text-caption text-on-surface-variant">
          Attendance is taken on the meeting page and printed under the details.{' '}
          <Link href={`/secretary/meetings/${meeting.id}?step=attendance`} className="font-semibold text-primary hover:underline">
            Open attendance
          </Link>
        </p>
        <hr className="my-sm border-t border-black" />

        {/* I. PRELIMINARIES */}
        <ChedSection numeral="I." title="Preliminaries">
          {PRELIMINARY.map((p) => (
            <div key={p.field} className="mt-sm">
              <label htmlFor={`prelim-${p.field}`} className="flex font-bold">
                <span className="inline-block min-w-[2.2em]">{p.letter}.</span>
                {p.label}
              </label>
              <p className="no-print pl-[2.2em] font-caption text-caption text-on-surface-variant">{p.hint}</p>
              <div className="pl-[2.2em]">
                <textarea
                  id={`prelim-${p.field}`}
                  rows={p.field === 'head_report' ? 3 : 2}
                  value={ched.preliminary[p.field]}
                  onChange={(e) => setPrelim(p.field, e.target.value)}
                  placeholder={p.field === 'quorum' ? 'Leave blank to print the recorded head-count from attendance.' : 'None.'}
                  className={cn(fieldClass, 'mt-xs')}
                />
              </div>
            </div>
          ))}
        </ChedSection>

        {/* II. NEW BUSINESS */}
        <ChedSection numeral="II." title="New Business">
          <p className="mt-sm flex font-bold">
            <span className="inline-block min-w-[2.2em]">A.</span>Matters for Approval
          </p>
          <p className="no-print pl-[2.2em] font-caption text-caption text-on-surface-variant">
            Each matter taken up: its category (grouped in CHED order on the printed copy), the discussion, and the action taken.
          </p>
          <ItemList
            list="newBusiness"
            items={ched.newBusiness}
            withCategory
            addLabel="Add a matter"
            emptyText="No matters yet."
            onUpdate={updateItem}
            onRemove={removeItem}
            onMove={moveItem}
            onAdd={addItem}
          />
        </ChedSection>

        {/* III. MATTERS FOR CONFIRMATION */}
        <ChedSection numeral="III." title="Matters for Confirmation">
          <ItemList
            list="confirmation"
            items={ched.confirmation}
            addLabel="Add a matter for confirmation"
            emptyText="None."
            onUpdate={updateItem}
            onRemove={removeItem}
            onMove={moveItem}
            onAdd={addItem}
          />
        </ChedSection>

        {/* IV. OTHER MATTERS */}
        <ChedSection numeral="IV." title="Other Matters">
          <ItemList
            list="other"
            items={ched.other}
            addLabel="Add another matter"
            emptyText="None."
            onUpdate={updateItem}
            onRemove={removeItem}
            onMove={moveItem}
            onAdd={addItem}
          />
        </ChedSection>

        {/* V. ADJOURNMENT */}
        <ChedSection numeral="V." title="Adjournment">
          <label htmlFor="adjournment" className="sr-only">
            Adjournment
          </label>
          <textarea
            id="adjournment"
            rows={2}
            value={ched.adjournment}
            onChange={(e) => setChed((c) => ({ ...c, adjournment: e.target.value }))}
            placeholder="There being no other matters, the meeting was adjourned at …"
            className={cn(fieldClass, 'mt-xs')}
          />
        </ChedSection>

        {minutes.ai_action_items.length > 0 ? (
          <section className="no-print mb-lg rounded-lg border border-tertiary-container/40 bg-tertiary-fixed/20 p-md font-body-sm">
            <h3 className="mb-sm flex items-center gap-sm font-h3 text-h3 text-primary">
              <Icon name="auto_awesome" className="text-outline" /> AI-suggested action items
            </h3>
            <div className="space-y-sm">
              {minutes.ai_action_items.map((item, i) => (
                <div key={i} className="rounded-lg border border-tertiary-container/30 bg-white p-sm">
                  <p className="font-body-sm">{item.text}</p>
                  <p className="mt-xs font-caption text-caption text-on-surface-variant">
                    Suggested assignee: {item.assignee || '—'} {item.deadline ? `· ${item.deadline}` : ''}
                  </p>
                  {convertingIndex === i ? (
                    <div className="mt-xs flex flex-wrap items-center gap-xs">
                      <select
                        aria-label="Assign to"
                        value={convertAssignee}
                        onChange={(e) => setConvertAssignee(e.target.value)}
                        className="rounded-lg border-outline-variant bg-surface-container-lowest text-body-sm"
                      >
                        <option value="">Assign to...</option>
                        {team.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="Deadline"
                        type="date"
                        value={convertDeadline}
                        onChange={(e) => setConvertDeadline(e.target.value)}
                        className="rounded-lg border-outline-variant bg-surface-container-lowest text-body-sm"
                      />
                      <Button size="sm" onClick={() => convertActionItem(i)}>
                        Create task
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConvertingIndex(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <button onClick={() => setConvertingIndex(i)} className="mt-xs font-label-caps text-label-caps text-primary hover:underline">
                      Convert to task
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-lg grid grid-cols-1 gap-xl md:grid-cols-2">
          <div>
            <p>Prepared by:</p>
            <div className="mb-xs flex h-[76px] items-end justify-center">
              {mySignature ? (
                // eslint-disable-next-line @next/next/no-img-element -- signature is a canvas-captured data URL, not a static asset
                <img src={mySignature.dataUrl} alt={`Signature of ${meeting.secretaryName ?? currentUserName}`} className="max-h-[68px]" />
              ) : showSignPad ? null : (
                <button
                  onClick={() => setShowSignPad(true)}
                  className="no-print flex items-center gap-xs rounded-lg border border-dashed border-primary bg-surface px-md py-sm font-body-sm text-primary hover:bg-primary-fixed/20"
                >
                  <Icon name="draw" size={16} /> Sign as secretary
                </button>
              )}
            </div>
            <div className="border-t border-black pt-[2px] text-center">
              <p className="font-bold uppercase">{meeting.secretaryName ?? currentUserName}</p>
              <p className="text-[10pt]">Secretary</p>
            </div>
          </div>
          <div>
            <p>Noted and approved by:</p>
            <div className="mb-xs flex h-[76px] items-end justify-center">
              {headSignature ? (
                // eslint-disable-next-line @next/next/no-img-element -- signature is a canvas-captured data URL, not a static asset
                <img src={headSignature.dataUrl} alt={`Signature of ${meeting.chairName ?? 'the head'}`} className="max-h-[68px]" />
              ) : (
                <span className="text-[9.5pt] italic text-[#555]">Awaiting the Head&apos;s approval</span>
              )}
            </div>
            <div className="border-t border-black pt-[2px] text-center">
              <p className="font-bold uppercase">{meeting.chairName ?? '—'}</p>
              <p className="text-[10pt]">{meeting.departmentName ? `Head, ${meeting.departmentName}` : 'Department Head'}</p>
            </div>
          </div>
        </section>

        {showSignPad ? (
          <div className="no-print mt-md border-t border-outline-variant pt-md">
            <SignaturePad onChange={setSignatureDraft} />
            <div className="mt-sm flex justify-end gap-sm">
              <Button variant="ghost" onClick={() => setShowSignPad(false)}>
                Cancel
              </Button>
              <Button onClick={handleSign} loading={signing}>
                Confirm signature
              </Button>
            </div>
          </div>
        ) : null}

        <section className="mt-xl border-t border-black pt-md">
          <h3 className="text-[11pt] font-bold uppercase">Annex A — Matrix of Action Items</h3>
          <table className="mt-xs w-full border-collapse text-[10pt]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                {['No.', 'Action item', 'Responsible', 'Deadline', 'Status'].map((h) => (
                  <th key={h} scope="col" className="border border-black px-xs py-[3px] text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-black px-xs py-sm text-center italic text-[#555]">
                    No action items yet. Convert an AI suggestion above, or delegate tasks from the meeting.
                  </td>
                </tr>
              ) : (
                tasks.map((t, i) => (
                  <tr key={t.id} className="align-top">
                    <td className="border border-black px-xs py-[3px]">{i + 1}</td>
                    <td className="border border-black px-xs py-[3px]">{t.title}</td>
                    <td className="border border-black px-xs py-[3px]">{t.assignee_name ?? <em>Unassigned</em>}</td>
                    <td className="border border-black px-xs py-[3px]">{t.deadline ?? '—'}</td>
                    <td className="border border-black px-xs py-[3px]">{humanize(t.status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>

      <section aria-labelledby="panel-notes-heading" className="no-print mt-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
          <h3 id="panel-notes-heading" className="flex items-center gap-sm font-h3 text-h3">
            <Icon name="draw" size={24} className="text-primary" /> Panel notes (from paper)
          </h3>
          <Link href={`/secretary/meetings/${meeting.id}?step=attachments`} className={buttonClasses('secondary', 'sm')}>
            <Icon name="add_a_photo" size={18} /> Add a photo of the notes
          </Link>
        </div>
        <p className="mb-md font-body-sm text-on-surface-variant">
          Photos of the panel&apos;s handwritten notes are kept with the meeting. Read them with AI to add the text here; it prints as an annex, separate from
          what was said in the recording.
        </p>
        {panelPhotos.length ? (
          <ul className="mb-md flex flex-col gap-sm">
            {panelPhotos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-sm">
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed private-bucket URL
                  <img src={p.url} alt={p.caption || p.file_name} className="h-14 w-14 rounded-lg border border-outline-variant object-cover" />
                ) : null}
                <span className="min-w-0 flex-1 truncate font-body-sm">{p.caption || p.file_name}</span>
                <Button variant="gold" size="sm" icon="auto_awesome" loading={readingPhotoId === p.id} disabled={readingPhotoId !== null} onClick={() => readPanelNotes(p)}>
                  {minutes.paper_notes.some((n) => n.attachmentId === p.id) ? 'Read again' : 'Read with AI'}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {minutes.paper_notes.length ? (
          <ul className="flex flex-col gap-xs">
            {minutes.paper_notes.map((n, i) => (
              <li key={n.id ?? i} className="rounded-lg bg-surface-container-low p-sm font-body-sm">
                {n.pageOrPanel ? <strong>{n.pageOrPanel}: </strong> : null}
                <span className="whitespace-pre-wrap">{n.note}</span>
              </li>
            ))}
          </ul>
        ) : panelPhotos.length === 0 ? (
          <p className="font-body-sm text-on-surface-variant">No panel notes yet.</p>
        ) : null}
      </section>

      <section className="comments-panel no-print mt-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <h3 className="mb-md flex items-center gap-sm font-h3 text-h3">
          <Icon name="forum" className="text-primary" /> Comments on this document
        </h3>
        <div className="mb-md space-y-sm">
          {minutes.comments.length === 0 ? (
            <p className="italic text-on-surface-variant">No comments yet.</p>
          ) : (
            minutes.comments.map((c) => (
              <div key={c.id} className="comment">
                <p className="font-body-sm font-semibold">{c.name}</p>
                <p className="font-caption text-caption text-on-surface-variant">{fmtManila(new Date(c.ts).toISOString())}</p>
                <p className="mt-xs font-body-sm">{c.text}</p>
              </div>
            ))
          )}
        </div>
        <form onSubmit={postComment} className="flex gap-sm">
          <input
            aria-label="Add a comment"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment for the panel or approvers…"
            className="flex-1 rounded-lg border-2 border-transparent bg-surface-container-low px-md py-sm focus:border-primary focus:ring-0"
          />
          <Button type="submit" loading={postingComment}>
            Post
          </Button>
        </form>
      </section>

      <Dialog
        open={printPrompt}
        onClose={() => setPrintPrompt(false)}
        size="sm"
        icon="check_circle"
        title="Minutes saved"
        description="Download them as PDF or Word, print now, or come back later — every saved meeting can be printed from Meeting History."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setPrintPrompt(false);
                toast.info('You can print these minutes anytime from Meeting History.');
              }}
            >
              Later
            </Button>
            <Button
              variant="secondary"
              icon="picture_as_pdf"
              onClick={() => {
                setPrintPrompt(false);
                void download('pdf');
              }}
            >
              PDF
            </Button>
            <Button
              variant="secondary"
              icon="description"
              onClick={() => {
                setPrintPrompt(false);
                void download('docx');
              }}
            >
              Word
            </Button>
            <a
              href={`/print/meetings/${meeting.id}?autoprint=1`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setPrintPrompt(false)}
              className={buttonClasses('primary', 'md', 'pl-sm')}
            >
              <Icon name="print" size={18} /> Print now
            </a>
          </>
        }
      >
        {minutes.status !== 'approved' ? <p className="font-body-sm text-on-surface-variant">Until the head approves them, every copy carries a DRAFT mark.</p> : null}
      </Dialog>
    </>
  );
}

function ChedSection({ numeral, title, children }: { numeral: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-md">
      <h3 className="border border-black bg-[#f2f2f2] px-sm py-[3px] text-[11pt] font-bold">
        {numeral} {title}
      </h3>
      <div className="border-x border-b border-black px-md pb-md pt-xs">{children}</div>
    </section>
  );
}

function ItemList({
  list,
  items,
  withCategory = false,
  addLabel,
  emptyText,
  onUpdate,
  onRemove,
  onMove,
  onAdd,
}: {
  list: ListKey;
  items: BusinessItem[];
  withCategory?: boolean;
  addLabel: string;
  emptyText: string;
  onUpdate: (list: ListKey, i: number, patch: Partial<BusinessItem>) => void;
  onRemove: (list: ListKey, i: number) => void;
  onMove: (list: ListKey, i: number, dir: -1 | 1) => void;
  onAdd: (list: ListKey) => void;
}) {
  return (
    <div className="pl-[2.2em]">
      {items.length === 0 ? <p className="mt-xs">{emptyText}</p> : null}
      <ol className="flex flex-col gap-sm">
        {items.map((it, i) => (
          <li key={i} className="mt-sm rounded-md border border-outline-variant bg-surface-container-lowest/60 p-sm">
            <div className="flex flex-wrap items-center gap-xs">
              <span className="min-w-[1.8em] font-bold">{i + 1}.</span>
              <label className="sr-only" htmlFor={`${list}-${i}-title`}>
                Matter {i + 1} title
              </label>
              <input
                id={`${list}-${i}-title`}
                value={it.title}
                onChange={(e) => onUpdate(list, i, { title: e.target.value })}
                placeholder="Title of the matter"
                className={cn(fieldClass, 'min-w-[12rem] flex-1 font-bold')}
              />
              {withCategory ? (
                <>
                  <label className="sr-only" htmlFor={`${list}-${i}-cat`}>
                    Category
                  </label>
                  <select
                    id={`${list}-${i}-cat`}
                    value={it.category ?? ''}
                    onChange={(e) => onUpdate(list, i, { category: (e.target.value || null) as ChedCategory | null })}
                    className={cn(fieldClass, 'w-auto')}
                  >
                    {CATEGORY_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </option>
                    ))}
                    <option value="">Other business</option>
                  </select>
                </>
              ) : null}
              <div className="no-print flex gap-[2px]">
                <button
                  type="button"
                  onClick={() => onMove(list, i, -1)}
                  disabled={i === 0}
                  aria-label={`Move matter ${i + 1} up`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
                >
                  <Icon name="arrow_upward" size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(list, i, 1)}
                  disabled={i === items.length - 1}
                  aria-label={`Move matter ${i + 1} down`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
                >
                  <Icon name="arrow_downward" size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(list, i)}
                  aria-label={`Remove matter ${i + 1}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            </div>
            <label className="mt-xs block pl-[1.8em] font-caption text-caption text-on-surface-variant" htmlFor={`${list}-${i}-notes`}>
              Discussion
            </label>
            <div className="pl-[1.8em]">
              <textarea
                id={`${list}-${i}-notes`}
                rows={3}
                value={it.notes}
                onChange={(e) => onUpdate(list, i, { notes: e.target.value })}
                placeholder="What was presented, by whom, and the substance of the discussion."
                className={fieldClass}
              />
            </div>
            <label className="mt-xs block pl-[1.8em] font-caption text-caption text-on-surface-variant" htmlFor={`${list}-${i}-action`}>
              Action taken
            </label>
            <div className="pl-[1.8em]">
              <textarea
                id={`${list}-${i}-action`}
                rows={1}
                value={it.action}
                onChange={(e) => onUpdate(list, i, { action: e.target.value })}
                placeholder="Approved / approved with amendments / deferred / noted — with mover and seconder."
                className={fieldClass}
              />
            </div>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => onAdd(list)} className="no-print mt-sm inline-flex items-center gap-xs font-label-caps text-label-caps text-primary hover:underline">
        <Icon name="add" size={16} /> {addLabel}
      </button>
    </div>
  );
}
