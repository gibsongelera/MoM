'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { SignModal } from '@/components/SignModal';
import { useData } from '@/components/DataProvider';
import { signMinutes, lockMinutes, returnMinutes, logAudit } from '@/lib/db';
import { scopeMeetings } from '@/lib/scope';
import { docTitleFor } from '@/lib/summarizer';
import { downloadMinutesDocx } from '@/lib/export';
import { ROLE_LABEL } from '@/lib/nav';
import { fmtDate } from '@/lib/utils';
import type { Signature, User } from '@/lib/types';

function Inner() {
  const { user, ready } = useRequireRole('head');
  usePageTitle('Approvals');
  const toast = useToast();
  const params = useSearchParams();

  const [signOpen, setSignOpen] = useState(false);
  const { meetings: allMeetings, departments, users, tasks, minutes, ready: dataReady, refresh } = useData();

  const meetings = useMemo(() => (user ? scopeMeetings(user, allMeetings) : []), [user, allMeetings]);

  const queue = meetings.filter((m) => ['pending_approval', 'approved'].includes(m.status));
  const [activeId, setActiveId] = useState('');

  if (!ready || !user || !dataReady) return null;

  const effectiveId = activeId || params.get('m') || queue[0]?.id || '';
  const m = meetings.find((x) => x.id === effectiveId);
  const min = m ? minutes.find((x) => x.meetingId === m.id) : null;

  async function doSign(dataUrl: string) {
    if (!m || !min) return;
    try {
      const signed = await signMinutes(min.id, ROLE_LABEL[user!.role], dataUrl);
      const sigs = signed?.signatures || [];
      const haveSecSig = sigs.some((s) => s.userId === m.secretaryId);
      const haveHeadSig = sigs.some((s) => s.userId === m.chairId);
      if (signed && haveSecSig && haveHeadSig && !signed.lockedAt) {
        await lockMinutes(min.id); // locks + marks meeting approved + notifies secretary
        void logAudit('minutes_locked', `${m.title} - locked by ${user!.name}`);
      }
      void logAudit('minutes_signed', `${m.title} - signed by ${user!.name}`);
      toast('Signature applied successfully.', 'success');
      await refresh();
    } catch {
      toast('Could not apply signature. You may not have permission on this document.', 'error');
    }
  }

  async function doReturn() {
    if (!m || !min) return;
    const reason = window.prompt('Reason for returning these minutes to the secretary (they will be notified):');
    if (reason === null) return;
    try {
      await returnMinutes(min.id, m.id, m.secretaryId, reason.trim() || 'Please revise.', user!.name);
      void logAudit('minutes_returned', `${m.title} returned to secretary by ${user!.name}`);
      toast('Returned to secretary for revision.', 'info');
      await refresh();
    } catch {
      toast('Could not return the document.', 'error');
    }
  }

  const dept = m ? departments.find((d) => d.id === m.departmentId) : null;
  const chair = m ? users.find((u) => u.id === m.chairId) : null;
  const secretary = m ? users.find((u) => u.id === m.secretaryId) : null;
  const sigSec = min?.signatures?.find((s) => s.userId === m?.secretaryId);
  const sigHead = min?.signatures?.find((s) => s.userId === m?.chairId);
  const locked = !!(min && min.lockedAt);
  const amendments = min?.amendments || [];

  const actionRows = (() => {
    if (!min || !m) return [];
    const ids = min.actionItems || [];
    return tasks.filter((t) => ids.includes(t.id) || t.meetingId === m.id);
  })();

  function SignatureBlock({ sig, person, role, isHead }: { sig?: Signature; person?: User | null; role: string; isHead: boolean }) {
    return (
      <div className="text-center">
        <div className="h-[80px] mb-xs flex items-end justify-center">
          {sig?.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sig.dataUrl} alt="signature" className="max-h-[70px]" />
          ) : isHead ? (
            <button onClick={() => setSignOpen(true)} className="bg-surface border border-dashed border-primary text-primary px-md py-sm rounded-lg hover:bg-primary-fixed/20 flex items-center gap-xs no-print">
              <span className="material-symbols-outlined text-[16px]">draw</span> Click to Sign
            </button>
          ) : (
            <span className="italic text-on-surface-variant text-body-sm">Pending secretary signature</span>
          )}
        </div>
        <div className="border-t border-on-surface-variant w-[80%] mx-auto pt-xs">
          <p className="font-body-md font-bold">{person ? person.name : '—'}</p>
          <p className="font-caption text-caption text-on-surface-variant">{role}</p>
          {sig ? <p className="font-caption text-caption text-on-surface-variant mt-xs">Signed {fmtDate(sig.signedAt, true)}</p> : null}
        </div>
      </div>
    );
  }

  const isDefense = m?.meetingType === 'capstone' || m?.meetingType === 'research';

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex items-center justify-between mb-lg flex-wrap gap-md">
        <div>
          <h1 className="font-h1 text-h1">Approvals &amp; Document Signing</h1>
          <p className="font-body-md text-on-surface-variant">Review AI-generated minutes, then digitally sign to approve.</p>
        </div>
        <button
          onClick={async () => {
            if (!m) return;
            try {
              await downloadMinutesDocx(
                {
                  meeting: { title: m.title, date: fmtDate(m.date, true), venue: m.venue || '', department: dept?.name || '', chair: chair?.name || '', secretary: secretary?.name || '' },
                  minutes: { documentTitle: min?.documentTitle || docTitleFor(m), callToOrder: min?.callToOrder, previousMinutes: min?.previousMinutes, agendaItems: min?.agendaItems, adjournment: min?.adjournment },
                  tasks: actionRows.map((t) => ({ title: t.title, assignee: users.find((u) => u.id === t.assigneeId)?.name || 'Unassigned', deadline: t.deadline || '', status: String(t.status).replace('_', ' ') })),
                  motions: (min?.motions || []).map((mo) => ({ text: mo.text, result: mo.result, votesFor: mo.votesFor, votesAgainst: mo.votesAgainst, votesAbstain: mo.votesAbstain })),
                },
                (min?.documentTitle || m.title).replace(/[^a-z0-9]+/gi, '_'),
              );
              toast('Minutes exported as .docx', 'success');
            } catch {
              toast('Export needs the server running with docx support.', 'error');
            }
          }}
          className="border border-outline-variant px-md py-sm rounded-lg hover:bg-surface-container flex items-center gap-xs"
        >
          <span className="material-symbols-outlined text-[18px]">description</span> .docx
        </button>
        <button onClick={() => window.print()} className="border border-outline-variant px-md py-sm rounded-lg hover:bg-surface-container flex items-center gap-xs">
          <span className="material-symbols-outlined text-[18px]">print</span> Print / PDF
        </button>
        {m && min && m.status === 'pending_approval' && !locked ? (
          <button onClick={doReturn} className="border border-error text-error px-md py-sm rounded-lg hover:bg-error/10 flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">undo</span> Return
          </button>
        ) : null}
      </header>

      <div className="grid grid-cols-12 gap-md">
        <aside className="col-span-12 lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden no-print">
          <div className="p-md border-b border-outline-variant">
            <h3 className="font-h3 text-h3">Queue</h3>
          </div>
          <div className="divide-y divide-outline-variant max-h-[600px] overflow-y-auto">
            {queue.length === 0 ? (
              <p className="p-md text-on-surface-variant">No documents in queue.</p>
            ) : (
              queue.map((mm) => {
                const active = mm.id === effectiveId;
                const mn = minutes.find((x) => x.meetingId === mm.id);
                const signed = (mn?.signatures || []).some((s) => s.userId === user.id);
                return (
                  <button key={mm.id} onClick={() => setActiveId(mm.id)} className={`w-full text-left p-md hover:bg-surface-container-low ${active ? 'bg-primary-fixed/40 border-l-4 border-primary' : ''}`}>
                    <p className={`font-body-md font-semibold ${active ? 'text-primary' : ''}`}>{mm.title}</p>
                    <p className="font-caption text-caption text-on-surface-variant">{fmtDate(mm.date)}</p>
                    <div className="mt-xs flex gap-xs">
                      {mm.status === 'approved' ? <span className="pill pill-done">Approved</span> : <span className="pill pill-progress">Pending</span>}
                      {signed ? <span className="pill pill-done">Signed</span> : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="col-span-12 lg:col-span-8">
          {!m ? (
            <p className="text-center text-on-surface-variant py-xl">Select a document from the queue.</p>
          ) : (
            <>
              {locked ? (
                <div className="lock-banner mb-md no-print">
                  <span className="material-symbols-outlined">lock</span>
                  <div>
                    <p className="font-semibold">This document is locked.</p>
                    <p className="font-caption text-caption text-on-surface-variant">Approved and locked on {fmtDate(min!.lockedAt!, true)}. Secretary edits will require re-approval.</p>
                  </div>
                </div>
              ) : null}
              {amendments.length ? (
                <div className="amend-banner mb-md no-print">
                  <span className="material-symbols-outlined">history_edu</span>
                  <div>
                    <p className="font-semibold">{amendments.length} amendment{amendments.length > 1 ? 's' : ''} on record.</p>
                    <p className="font-caption text-caption text-on-surface-variant">Latest: {amendments[amendments.length - 1].summary} - {fmtDate(amendments[amendments.length - 1].ts, true)}</p>
                  </div>
                </div>
              ) : null}

              <div className="ched-doc">
                <div className="text-center border-b-2 border-primary pb-md mb-lg">
                  <div className="w-16 h-16 mx-auto mb-sm rounded-full bg-primary text-on-primary flex items-center justify-center shadow-primary-md">
                    <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance</span>
                  </div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mb-xs">Zamboanga Peninsula Polytechnic State University</p>
                  <h2 className="font-h2 text-h2 text-primary font-bold">{dept ? dept.name.toUpperCase() : 'OFFICE'}</h2>
                  <h1 className="font-h1 text-h1 mt-sm">{min?.documentTitle || docTitleFor(m)}</h1>
                  <h3 className="font-h3 text-h3 text-on-surface-variant mt-xs">{m.title}</h3>
                </div>
                <div className="grid grid-cols-2 gap-md mb-md text-body-md">
                  <p><strong className="text-on-surface-variant">Date:</strong> {fmtDate(m.date, true)}</p>
                  <p><strong className="text-on-surface-variant">Venue:</strong> {m.venue || '—'}</p>
                  <p><strong className="text-on-surface-variant">Presiding Officer:</strong> {chair ? chair.name : '—'}</p>
                  <p><strong className="text-on-surface-variant">Secretary:</strong> {secretary ? secretary.name : '—'}</p>
                </div>

                {isDefense ? (
                  <div className="mb-xl bg-tertiary-fixed/30 border border-tertiary-container/40 rounded-lg p-md">
                    <p className="font-label-caps text-label-caps text-tertiary mb-sm flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[16px]">school</span> {m.meetingType === 'capstone' ? 'Capstone' : 'Research'} Defense Details
                    </p>
                    <div className="grid grid-cols-2 gap-md text-body-sm">
                      <p><strong className="text-on-surface-variant">Project Title:</strong> {m.projectTitle || '—'}</p>
                      <p><strong className="text-on-surface-variant">Sub-Type:</strong> {m.subType || '—'}</p>
                      {m.meetingType === 'capstone' ? <p><strong className="text-on-surface-variant">Chairperson:</strong> {users.find((u) => u.id === m.chairpersonId)?.name || '—'}</p> : null}
                      <p><strong className="text-on-surface-variant">Adviser:</strong> {users.find((u) => u.id === m.adviserId)?.name || '—'}</p>
                      {m.meetingType === 'capstone' ? (
                        <p className="col-span-2"><strong className="text-on-surface-variant">Panel Members:</strong> {(m.panelMemberIds || []).map((id) => users.find((u) => u.id === id)?.name || '—').join(', ') || '—'}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <section className="mb-lg">
                  <h3 className="font-h3 text-h3 text-primary mb-sm flex items-center gap-sm"><span className="material-symbols-outlined text-outline">gavel</span> 1. Call to Order &amp; Attendance</h3>
                  <p>{min?.callToOrder || 'Meeting called to order.'}</p>
                </section>
                <section className="mb-lg">
                  <h3 className="font-h3 text-h3 text-primary mb-sm flex items-center gap-sm"><span className="material-symbols-outlined text-outline">history</span> 2. Approval of Previous Minutes</h3>
                  <p>{min?.previousMinutes || '—'}</p>
                </section>
                <section className="mb-xl">
                  <h3 className="font-h3 text-h3 text-primary mb-md flex items-center gap-sm"><span className="material-symbols-outlined text-outline">list_alt</span> 3. Agenda Items &amp; Discussions</h3>
                  {(min?.agendaItems || []).map((a, i) => (
                    <div key={i} className="glass-panel border-l-4 border-l-tertiary-container rounded-r-lg p-md mb-md">
                      <div className="flex items-center gap-sm mb-xs">
                        <h4 className="font-body-lg font-semibold">{a.title}</h4>
                        <span className="ai-badge">AI Summarized</span>
                      </div>
                      <p>{a.notes}</p>
                    </div>
                  ))}
                </section>
                <section className="mb-xl">
                  <h3 className="font-h3 text-h3 text-primary mb-md flex items-center gap-sm"><span className="material-symbols-outlined text-outline">assignment_turned_in</span> 4. Action Items</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-body-sm">
                      <thead>
                        <tr className="border-b-2 border-outline-variant font-label-caps text-label-caps text-on-surface-variant uppercase">
                          <th className="py-sm px-md">Task</th>
                          <th className="py-sm px-md">Assignee</th>
                          <th className="py-sm px-md">Deadline</th>
                          <th className="py-sm px-md">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {actionRows.length === 0 ? (
                          <tr><td colSpan={4} className="p-md text-on-surface-variant">No action items captured.</td></tr>
                        ) : (
                          actionRows.map((t) => {
                            const a = users.find((u) => u.id === t.assigneeId);
                            const pill = t.status === 'done' ? 'pill-done' : t.status === 'in_progress' ? 'pill-progress' : 'pill-pending';
                            return (
                              <tr key={t.id} className="border-b border-outline-variant/50">
                                <td className="py-sm px-md font-medium">{t.title}</td>
                                <td className="py-sm px-md">{a ? a.name : <em className="text-on-surface-variant">Unassigned</em>}</td>
                                <td className="py-sm px-md">{t.deadline || '—'}</td>
                                <td className="py-sm px-md"><span className={`pill ${pill}`}>{t.status.replace('_', ' ')}</span></td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="mb-lg">
                  <h3 className="font-h3 text-h3 text-primary mb-sm">5. Adjournment</h3>
                  <p>{min?.adjournment || '—'}</p>
                </section>

                <section className="mt-xxl pt-lg border-t border-outline-variant grid grid-cols-1 md:grid-cols-2 gap-xl">
                  <SignatureBlock sig={sigSec} person={secretary} role="Faculty Secretary" isHead={false} />
                  <SignatureBlock sig={sigHead} person={chair} role="Presiding Officer / Dean" isHead={true} />
                </section>

                {m.status === 'approved' ? (
                  <div className="mt-xl bg-success-container border-l-4 border-success rounded-lg p-md flex items-center gap-sm no-print">
                    <span className="material-symbols-outlined text-success">verified</span>
                    <div>
                      <p className="font-semibold text-on-surface">This document is fully approved and locked.</p>
                      <p className="font-caption text-caption text-on-surface-variant">Use Print/PDF to export the final report.</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>

      <SignModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        title="Approve & Sign Minutes"
        subtitle="Your signature legally approves and locks this document."
        onConfirm={doSign}
      />
    </div>
  );
}

export default function HeadApprovals() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
