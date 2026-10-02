'use client';

/**
 * Port of secretary/mom-editor.html.
 *
 * The legacy version hand-rolls the lock/amend state machine in client JS
 * (clear the Head's signature, revert status, log an amendment, notify the
 * chair - all as separate localStorage writes that could partially fail).
 * Here that whole sequence is one call to the amend_minutes() database
 * function (0003_functions.sql), which does it as a single transaction.
 * route_minutes_for_approval() and sign_minutes() are the same story for the
 * non-locked save path and signing.
 *
 * ai_action_items (staged on the minutes row by the webhook - see
 * 0010_minutes_ai_action_items.sql) are Claude's free-text extraction
 * (assignee as a name string, deadline as a spoken phrase) - "Convert to
 * Task" is the human resolution step that turns one into a real tasks row
 * with a real assignee_id and a real date, exactly the gap flagged when
 * that column was added.
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { docTitleFor } from '@/lib/ai/doc-title';
import type { MeetingType } from '@/lib/types/domain';
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
  chairId: string | null;
  chairName: string | null;
  secretaryId: string | null;
  secretaryName: string | null;
  chairpersonName: string | null;
  adviserName: string | null;
  panelNames: string[];
}

export interface AgendaItem {
  title: string;
  notes: string;
}
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
  };
}

export default function MomEditor({
  meeting,
  initialMinutes,
  tasks,
  team,
  currentUserId,
  currentUserName,
}: {
  meeting: MeetingDetail;
  initialMinutes: MinutesDetail | null;
  tasks: AssignedTask[];
  team: TeamMember[];
  currentUserId: string;
  currentUserName: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [minutes, setMinutes] = useState<MinutesDetail>(initialMinutes ?? emptyMinutes());
  const wasLocked = Boolean(initialMinutes?.locked_at);
  const [saving, setSaving] = useState(false);
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

  function updateAgenda(i: number, key: 'title' | 'notes', value: string) {
    setMinutes((m) => ({
      ...m,
      agenda_items: m.agenda_items.map((a, idx) => (idx === i ? { ...a, [key]: value } : a)),
    }));
  }
  function addAgenda() {
    setMinutes((m) => ({ ...m, agenda_items: [...m.agenda_items, { title: 'New Agenda Item', notes: '' }] }));
  }
  function removeAgenda(i: number) {
    setMinutes((m) => ({ ...m, agenda_items: m.agenda_items.filter((_, idx) => idx !== i) }));
  }

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

    const payload = {
      meeting_id: meeting.id,
      document_title: docTitle,
      call_to_order: minutes.call_to_order,
      previous_minutes: minutes.previous_minutes,
      agenda_items: minutes.agenda_items,
      adjournment: minutes.adjournment,
    };
    if (minutes.id) {
      const { error: updateError } = await supabase.from('minutes').update(payload).eq('id', minutes.id);
      if (updateError) throw updateError;
      return minutes.id;
    }
    const { data, error: insertError } = await supabase.from('minutes').insert(payload).select('id').single();
    if (insertError) throw insertError;
    setMinutes((m) => ({ ...m, id: data.id }));
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
        p_role_label: 'Faculty Secretary',
        p_data_url: signatureDraft,
      });
      if (signError) throw signError;
      if (data) setMinutes((m) => ({ ...m, signatures: data.signatures }));
      setShowSignPad(false);
      setSignatureDraft(null);
      setNotice('Signed. Save & Route to send this to the Head for approval.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign.');
    } finally {
      setSigning(false);
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
        const { data, error: amendError } = await supabase.rpc('amend_minutes', {
          p_minutes_id: minutes.id,
          p_summary: 'Minutes edited after lock; re-approval required.',
          p_call_to_order: minutes.call_to_order,
          p_previous_minutes: minutes.previous_minutes,
          p_agenda_items: minutes.agenda_items,
          p_adjournment: minutes.adjournment,
        });
        if (amendError) throw amendError;
        if (data) setMinutes((m) => ({ ...m, ...data }));
        setNotice('Amendment saved. The Head has been notified to re-approve.');
      } else {
        const id = await ensureSaved();
        const { data, error: routeError } = await supabase.rpc('route_minutes_for_approval', { p_minutes_id: id });
        if (routeError) throw routeError;
        if (data) setMinutes((m) => ({ ...m, ...data }));
        setNotice('Saved and routed to the Head for approval.');
      }
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
    await supabase.from('minutes').update({ ai_action_items: remaining }).eq('id', id);
    setMinutes((m) => ({ ...m, ai_action_items: remaining }));
    setConvertingIndex(null);
    setConvertAssignee('');
    setConvertDeadline('');
    router.refresh();
  }

  const projectMeta = meeting.meeting_type !== 'regular';

  return (
    <>
      <header className="flex items-center justify-between flex-wrap gap-md mb-lg no-print">
        <div>
          <h1 className="font-h1 text-h1">Meeting Document Editor</h1>
          <p className="font-body-md text-on-surface-variant">
            {meeting.title} · {new Date(meeting.starts_at).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex gap-sm flex-wrap">
          <button onClick={() => window.print()} className="border border-outline-variant px-md py-sm rounded-lg hover:bg-surface-container flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">print</span> Print/PDF
          </button>
          <button onClick={handleSaveAndRoute} disabled={saving} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center gap-xs disabled:opacity-60">
            <span className="material-symbols-outlined text-[18px]">send</span> {saving ? 'Saving...' : 'Save & Route'}
          </button>
        </div>
      </header>

      {error ? <div className="no-print mb-md bg-error-container text-error rounded-lg p-sm font-body-sm">{error}</div> : null}
      {notice ? <div className="no-print mb-md bg-success-container text-success rounded-lg p-sm font-body-sm">{notice}</div> : null}

      {minutes.locked_at ? (
        <div className="amend-banner mb-md no-print">
          <span className="material-symbols-outlined">edit_note</span>
          <div>
            <p className="font-semibold">This document is locked by the Head&apos;s approval.</p>
            <p className="font-caption text-caption">
              Saving any change will clear the Head&apos;s signature, revert status to pending approval, and notify them to
              re-approve. Every amendment is recorded.
            </p>
          </div>
        </div>
      ) : null}

      {minutes.amendments.length > 0 ? (
        <details className="no-print bg-surface-container-low border border-outline-variant rounded-lg p-md mb-md">
          <summary className="cursor-pointer font-semibold flex items-center gap-sm">
            <span className="material-symbols-outlined text-tertiary-container">history_edu</span> Amendment History ({minutes.amendments.length})
          </summary>
          <ul className="mt-sm space-y-xs">
            {[...minutes.amendments].reverse().map((a, i) => (
              <li key={i} className="text-body-sm">
                <span className="font-semibold">{a.byName}</span>
                <span className="text-on-surface-variant"> · {new Date(a.ts).toLocaleString()}</span>
                <p className="text-on-surface-variant ml-md">{a.summary}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="ched-doc">
        <div className="text-center border-b-2 border-primary pb-md mb-lg">
          <div className="w-16 h-16 mx-auto mb-sm rounded-full bg-primary text-on-primary flex items-center justify-center shadow-primary-md">
            <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              account_balance
            </span>
          </div>
          <p className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mb-xs">
            Zamboanga Peninsula Polytechnic State University
          </p>
          <h2 className="font-h2 text-h2 text-primary font-bold">{meeting.departmentName?.toUpperCase() ?? ''}</h2>
          <h1 className="font-h1 text-h1 mt-sm">{docTitle}</h1>
          <h3 className="font-h3 text-h3 text-on-surface-variant mt-xs">{meeting.title}</h3>
        </div>

        <div className="grid grid-cols-2 gap-md mb-md text-body-md">
          <p>
            <strong className="text-on-surface-variant">Date:</strong>{' '}
            {new Date(meeting.starts_at).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
          <p>
            <strong className="text-on-surface-variant">Venue:</strong> {meeting.venue ?? '—'}
          </p>
          <p>
            <strong className="text-on-surface-variant">Presiding Officer:</strong> {meeting.chairName ?? '—'}
          </p>
          <p>
            <strong className="text-on-surface-variant">Secretary:</strong> {meeting.secretaryName ?? '—'}
          </p>
        </div>

        {projectMeta ? (
          <div className="mb-xl bg-tertiary-fixed/30 border border-tertiary-container/40 rounded-lg p-md">
            <p className="font-label-caps text-label-caps text-tertiary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px]">school</span>
              {meeting.meeting_type === 'capstone' ? 'Capstone' : 'Research'} Defense Details
            </p>
            <div className="grid grid-cols-2 gap-md text-body-sm">
              <p>
                <strong className="text-on-surface-variant">Project Title:</strong> {meeting.project_title ?? '—'}
              </p>
              <p>
                <strong className="text-on-surface-variant">Sub-Type:</strong> {meeting.sub_type ?? '—'}
              </p>
              {meeting.meeting_type === 'capstone' ? (
                <p>
                  <strong className="text-on-surface-variant">Chairperson:</strong> {meeting.chairpersonName ?? '—'}
                </p>
              ) : null}
              <p>
                <strong className="text-on-surface-variant">Adviser:</strong> {meeting.adviserName ?? '—'}
              </p>
              {meeting.meeting_type === 'capstone' ? (
                <p className="col-span-2">
                  <strong className="text-on-surface-variant">Panel Members:</strong> {meeting.panelNames.join(', ') || '—'}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <section className="mb-lg">
          <h3 className="font-h3 text-h3 text-primary mb-sm flex items-center gap-sm">
            <span className="material-symbols-outlined text-outline">gavel</span> 1. Call to Order &amp; Attendance
          </h3>
          <textarea
            rows={3}
            value={minutes.call_to_order}
            onChange={(e) => setMinutes((m) => ({ ...m, call_to_order: e.target.value }))}
            className="w-full p-sm border border-outline-variant rounded-lg focus:border-primary focus:ring-0"
          />
        </section>

        <section className="mb-lg">
          <h3 className="font-h3 text-h3 text-primary mb-sm flex items-center gap-sm">
            <span className="material-symbols-outlined text-outline">history</span> 2. Approval of Previous Minutes
          </h3>
          <textarea
            rows={3}
            value={minutes.previous_minutes}
            onChange={(e) => setMinutes((m) => ({ ...m, previous_minutes: e.target.value }))}
            className="w-full p-sm border border-outline-variant rounded-lg focus:border-primary focus:ring-0"
          />
        </section>

        <section className="mb-xl">
          <div className="flex items-center justify-between mb-md">
            <h3 className="font-h3 text-h3 text-primary flex items-center gap-sm">
              <span className="material-symbols-outlined text-outline">list_alt</span> 3. Agenda Items &amp; Discussions
            </h3>
            <button onClick={addAgenda} className="no-print text-primary hover:underline font-label-caps text-label-caps flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px]">add</span> Add Item
            </button>
          </div>
          <div className="space-y-md">
            {minutes.agenda_items.length === 0 ? (
              <p className="text-on-surface-variant italic">No agenda items yet. Add one above.</p>
            ) : (
              minutes.agenda_items.map((a, i) => (
                <div key={i} className="glass-panel border-l-4 border-l-tertiary-container rounded-r-lg p-md relative">
                  <button onClick={() => removeAgenda(i)} className="no-print absolute top-sm right-sm text-on-surface-variant hover:text-error">
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                  <input
                    value={a.title}
                    onChange={(e) => updateAgenda(i, 'title', e.target.value)}
                    className="font-body-lg font-semibold bg-transparent border-0 focus:bg-surface-container-low focus:ring-1 focus:ring-primary rounded px-xs w-full mb-xs"
                  />
                  <textarea
                    rows={3}
                    value={a.notes}
                    onChange={(e) => updateAgenda(i, 'notes', e.target.value)}
                    className="w-full bg-transparent border-0 focus:bg-surface-container-low focus:ring-1 focus:ring-primary rounded p-sm"
                  />
                </div>
              ))
            )}
          </div>
        </section>

        {minutes.ai_action_items.length > 0 ? (
          <section className="mb-xl no-print">
            <h3 className="font-h3 text-h3 text-primary mb-md flex items-center gap-sm">
              <span className="material-symbols-outlined text-outline">auto_awesome</span> AI-Suggested Action Items
            </h3>
            <div className="space-y-sm">
              {minutes.ai_action_items.map((item, i) => (
                <div key={i} className="bg-tertiary-fixed/20 border border-tertiary-container/30 rounded-lg p-sm">
                  <p className="font-body-sm">{item.text}</p>
                  <p className="font-caption text-caption text-on-surface-variant mt-xs">
                    Suggested assignee: {item.assignee || '—'} {item.deadline ? `· ${item.deadline}` : ''}
                  </p>
                  {convertingIndex === i ? (
                    <div className="flex flex-wrap gap-xs mt-xs items-center">
                      <select value={convertAssignee} onChange={(e) => setConvertAssignee(e.target.value)} className="rounded-lg border-outline-variant bg-surface-container-lowest text-body-sm">
                        <option value="">Assign to...</option>
                        {team.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <input type="date" value={convertDeadline} onChange={(e) => setConvertDeadline(e.target.value)} className="rounded-lg border-outline-variant bg-surface-container-lowest text-body-sm" />
                      <button onClick={() => convertActionItem(i)} className="bg-primary text-on-primary px-sm py-xs rounded-lg text-body-sm font-semibold">
                        Create Task
                      </button>
                      <button onClick={() => setConvertingIndex(null)} className="text-on-surface-variant text-body-sm">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConvertingIndex(i)} className="text-primary hover:underline font-label-caps text-label-caps mt-xs">
                      Convert to Task
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mb-xl">
          <h3 className="font-h3 text-h3 text-primary mb-md flex items-center gap-sm">
            <span className="material-symbols-outlined text-outline">assignment_turned_in</span> 4. Action Items
          </h3>
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
                <tr>
                  <td colSpan={4} className="py-md text-center text-on-surface-variant">
                    No action items.
                  </td>
                </tr>
              ) : (
                tasks.map((t) => (
                  <tr key={t.id} className="border-b border-outline-variant/50">
                    <td className="py-sm px-md">{t.title}</td>
                    <td className="py-sm px-md">{t.assignee_name ?? <em className="text-on-surface-variant">Unassigned</em>}</td>
                    <td className="py-sm px-md">{t.deadline ?? '—'}</td>
                    <td className="py-sm px-md">
                      <span className={`pill ${t.status === 'done' ? 'pill-done' : t.status === 'in_progress' ? 'pill-progress' : 'pill-pending'}`}>{t.status.replace('_', ' ')}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="mb-lg">
          <h3 className="font-h3 text-h3 text-primary mb-sm">5. Adjournment</h3>
          <textarea
            rows={2}
            value={minutes.adjournment}
            onChange={(e) => setMinutes((m) => ({ ...m, adjournment: e.target.value }))}
            className="w-full p-sm border border-outline-variant rounded-lg focus:border-primary focus:ring-0"
          />
        </section>

        <section className="mt-xxl pt-lg border-t border-outline-variant grid grid-cols-1 md:grid-cols-2 gap-xl">
          <div className="text-center">
            <div className="h-[80px] mb-xs flex items-end justify-center">
              {mySignature ? (
                // eslint-disable-next-line @next/next/no-img-element -- signature is a canvas-captured data URL, not a static asset
                <img src={mySignature.dataUrl} alt="signature" className="max-h-[70px]" />
              ) : showSignPad ? null : (
                <button
                  onClick={() => setShowSignPad(true)}
                  className="no-print bg-surface border border-dashed border-primary text-primary px-md py-sm rounded-lg hover:bg-primary-fixed/20 flex items-center gap-xs"
                >
                  <span className="material-symbols-outlined text-[16px]">draw</span> Sign as Secretary
                </button>
              )}
            </div>
            <div className="border-t border-on-surface-variant w-[80%] mx-auto pt-xs">
              <p className="font-body-md font-bold">{meeting.secretaryName ?? currentUserName}</p>
              <p className="font-caption text-caption text-on-surface-variant">Faculty Secretary</p>
            </div>
          </div>
          <div className="text-center">
            <div className="h-[80px] mb-xs flex items-end justify-center">
              {headSignature ? (
                // eslint-disable-next-line @next/next/no-img-element -- signature is a canvas-captured data URL, not a static asset
                <img src={headSignature.dataUrl} alt="signature" className="max-h-[70px]" />
              ) : (
                <span className="italic text-on-surface-variant text-body-sm">Awaiting Head&apos;s signature</span>
              )}
            </div>
            <div className="border-t border-on-surface-variant w-[80%] mx-auto pt-xs">
              <p className="font-body-md font-bold">{meeting.chairName ?? '—'}</p>
              <p className="font-caption text-caption text-on-surface-variant">Presiding Officer / Dean</p>
            </div>
          </div>
        </section>

        {showSignPad ? (
          <div className="no-print mt-md border-t border-outline-variant pt-md">
            <SignaturePad onChange={setSignatureDraft} />
            <div className="flex justify-end gap-sm mt-sm">
              <button onClick={() => setShowSignPad(false)} className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant">
                Cancel
              </button>
              <button onClick={handleSign} disabled={signing} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md font-semibold disabled:opacity-60">
                {signing ? 'Signing...' : 'Confirm Signature'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <section className="comments-panel mt-lg bg-surface-container-lowest border border-outline-variant rounded-xl p-md no-print">
        <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
          <span className="material-symbols-outlined text-primary">forum</span> Comments on this document
        </h3>
        <div className="space-y-sm mb-md">
          {minutes.comments.length === 0 ? (
            <p className="text-on-surface-variant italic">No comments yet.</p>
          ) : (
            minutes.comments.map((c) => (
              <div key={c.id} className="comment">
                <p className="font-body-sm font-semibold">{c.name}</p>
                <p className="font-caption text-caption text-on-surface-variant">{new Date(c.ts).toLocaleString()}</p>
                <p className="font-body-sm mt-xs">{c.text}</p>
              </div>
            ))
          )}
        </div>
        <form onSubmit={postComment} className="flex gap-sm">
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment for the panel / approvers..."
            className="flex-1 px-md py-sm rounded-lg bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0"
          />
          <button type="submit" disabled={postingComment} className="px-md py-sm rounded-lg bg-primary text-on-primary shadow-primary-md font-label-caps text-label-caps disabled:opacity-60">
            Post
          </button>
        </form>
      </section>
    </>
  );
}
