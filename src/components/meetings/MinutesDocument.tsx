/**
 * The official minutes, read-only, in the CHED layout (date, participants,
 * discussion, decisions/action items, approval). Server-safe: no hooks, no
 * browser APIs. Used by the print route and the head's approval preview.
 *
 * Until the head approves, every page carries a DRAFT mark, so a printout
 * can never be mistaken for the approved record.
 */
import type { PrintableMeeting } from '@/lib/meetings/printable';
import { ATTACHMENT_KIND_LABEL } from '@/lib/meetings/files';
import { fmtManila, fmtManilaDate } from '@/lib/utils/datetime';
import { humanize } from '@/lib/ui/status';

export default function MinutesDocument({ data }: { data: PrintableMeeting }) {
  const { meeting, minutes } = data;
  const approved = minutes?.status === 'approved' && Boolean(minutes.locked_at);
  const signatures = minutes?.signatures ?? [];
  const secretarySig = signatures.find((s) => s.kind === 'secretary') ?? signatures.find((s) => /secretary/i.test(s.role));
  const approverSig =
    signatures.find((s) => s.kind === 'approver') ?? signatures.find((s) => /(head|dean|chair|president|administrator)/i.test(s.role));
  const present = data.attendance.filter((r) => r.present);
  const absent = data.attendance.filter((r) => !r.present && r.kind !== 'walk_in');
  const isProject = meeting.meeting_type !== 'regular';

  return (
    <article className="ched-doc relative">
      {!approved ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
        >
          <span className="rotate-[-30deg] select-none font-display text-[120px] font-bold tracking-widest text-primary/10">DRAFT</span>
        </div>
      ) : null}

      <header className="mb-lg border-b-2 border-primary pb-md text-center">
        <p className="mb-xs font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">{data.institution}</p>
        {data.department ? <p className="font-h3 text-h3 font-bold uppercase text-primary">{data.department}</p> : null}
        <h1 className="mt-sm font-h1 text-h1">{data.docTitle}</h1>
        {data.docTitle !== meeting.title ? <p className="mt-xs font-body-lg text-on-surface-variant">{meeting.title}</p> : null}
        {!approved ? (
          <p className="mt-sm font-label-caps text-label-caps uppercase text-error">
            Draft — {minutes ? humanize(minutes.status) : 'not yet written'}; not the approved record
          </p>
        ) : null}
      </header>

      <dl className="mb-lg grid grid-cols-1 gap-x-md gap-y-xs font-body-md sm:grid-cols-2">
        <div>
          <dt className="inline font-semibold text-on-surface-variant">Date and time: </dt>
          <dd className="inline">{fmtManila(meeting.starts_at, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-on-surface-variant">Venue: </dt>
          <dd className="inline">{meeting.venue ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-on-surface-variant">Presiding officer: </dt>
          <dd className="inline">{data.presidingName ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-on-surface-variant">Secretary: </dt>
          <dd className="inline">{data.secretaryName ?? '—'}</dd>
        </div>
        {meeting.is_emergency ? (
          <div className="sm:col-span-2">
            <dt className="inline font-semibold text-on-surface-variant">Type: </dt>
            <dd className="inline">Emergency (unscheduled) meeting</dd>
          </div>
        ) : null}
      </dl>

      {isProject ? (
        <section className="mb-lg rounded-lg border border-tertiary-container/50 p-md">
          <h2 className="mb-sm font-h3 text-h3 text-primary">
            {meeting.meeting_type === 'capstone' ? 'Capstone' : 'Research'} {meeting.sub_type ?? ''}
          </h2>
          <dl className="grid grid-cols-1 gap-xs font-body-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="inline font-semibold">Title: </dt>
              <dd className="inline">{meeting.project_title ?? '—'}</dd>
            </div>
            {meeting.meeting_type === 'capstone' ? (
              <div>
                <dt className="inline font-semibold">Chairperson: </dt>
                <dd className="inline">{meeting.chairperson_name ?? '—'}</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline font-semibold">Adviser: </dt>
              <dd className="inline">{meeting.adviser_name ?? '—'}</dd>
            </div>
            {meeting.meeting_type === 'capstone' ? (
              <div className="sm:col-span-2">
                <dt className="inline font-semibold">Panel members: </dt>
                <dd className="inline">
                  {meeting.panel.length
                    ? meeting.panel.map((p) => (p.affiliation ? `${p.name} (${p.affiliation})` : p.name)).join('; ')
                    : '—'}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="mb-lg">
        <h2 className="mb-sm font-h3 text-h3 text-primary">Attendance</h2>
        {data.attendance.length === 0 ? (
          <p className="font-body-sm text-on-surface-variant">No attendance was recorded.</p>
        ) : (
          <>
            <p className="mb-xs font-body-sm font-semibold">Present ({present.length})</p>
            <ol className="mb-sm list-decimal pl-lg font-body-sm">
              {present.map((r) => (
                <li key={r.key}>
                  {r.name} — {r.role}
                  {!r.userId && r.kind === 'guest' ? ' (guest)' : ''}
                </li>
              ))}
            </ol>
            {absent.length ? (
              <>
                <p className="mb-xs font-body-sm font-semibold">Absent ({absent.length})</p>
                <ol className="list-decimal pl-lg font-body-sm">
                  {absent.map((r) => (
                    <li key={r.key}>
                      {r.name} — {r.role}
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </>
        )}
      </section>

      <Section title="1. Call to order">{minutes?.call_to_order}</Section>
      <Section title="2. Approval of previous minutes">{minutes?.previous_minutes}</Section>

      <section className="mb-lg">
        <h2 className="mb-sm font-h3 text-h3 text-primary">3. Agenda items and discussion</h2>
        {minutes?.agenda_items?.length ? (
          <ol className="flex flex-col gap-sm">
            {minutes.agenda_items.map((a, i) => (
              <li key={i}>
                <p className="font-body-md font-semibold">
                  {i + 1}. {a.title}
                </p>
                <p className="whitespace-pre-wrap font-body-sm">{a.notes}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="font-body-sm text-on-surface-variant">No agenda items recorded.</p>
        )}
      </section>

      <section className="mb-lg">
        <h2 className="mb-sm font-h3 text-h3 text-primary">4. Action items</h2>
        {data.tasks.length ? (
          <table className="w-full text-left font-body-sm">
            <thead>
              <tr className="border-b-2 border-outline-variant">
                <th scope="col" className="py-xs pr-sm">Task</th>
                <th scope="col" className="py-xs pr-sm">Responsible</th>
                <th scope="col" className="py-xs pr-sm">Deadline</th>
                <th scope="col" className="py-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.tasks.map((t, i) => (
                <tr key={i} className="border-b border-outline-variant/60">
                  <td className="py-xs pr-sm">{t.title}</td>
                  <td className="py-xs pr-sm">{t.assignee ?? 'Unassigned'}</td>
                  <td className="py-xs pr-sm">{t.deadline ? fmtManilaDate(`${t.deadline}T00:00:00+08:00`) : '—'}</td>
                  <td className="py-xs">{humanize(t.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="font-body-sm text-on-surface-variant">No action items.</p>
        )}
      </section>

      <Section title="5. Adjournment">{minutes?.adjournment}</Section>

      <section className="mt-xl grid grid-cols-1 gap-xl border-t border-outline-variant pt-lg sm:grid-cols-2">
        <SignatureBlock label="Prepared by" name={data.secretaryName} role="Faculty Secretary" dataUrl={secretarySig?.dataUrl} />
        <SignatureBlock
          label="Approved by"
          name={data.presidingName}
          role="Department Head"
          dataUrl={approved ? approverSig?.dataUrl : undefined}
          pending={!approved}
        />
      </section>

      {minutes?.paper_notes?.length || data.attachments.length ? (
        <section className="mt-xl border-t border-outline-variant pt-lg">
          <h2 className="mb-sm font-h3 text-h3 text-primary">Annex</h2>
          {minutes?.paper_notes?.length ? (
            <>
              <h3 className="mb-xs font-body-md font-semibold">Panel notes (from paper)</h3>
              <ul className="mb-md flex list-disc flex-col gap-xs pl-lg font-body-sm">
                {minutes.paper_notes.map((n, i) => (
                  <li key={n.id ?? i}>
                    {n.pageOrPanel ? <strong>{n.pageOrPanel}: </strong> : null}
                    <span className="whitespace-pre-wrap">{n.note}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {data.attachments.length ? (
            <>
              <h3 className="mb-xs font-body-md font-semibold">Attachments kept with the record</h3>
              <ol className="list-decimal pl-lg font-body-sm">
                {data.attachments.map((a, i) => (
                  <li key={i}>
                    {ATTACHMENT_KIND_LABEL[a.kind]}: {a.caption || a.file_name}
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </section>
      ) : null}
    </article>
  );
}

function Section({ title, children }: { title: string; children?: string }) {
  return (
    <section className="mb-lg">
      <h2 className="mb-sm font-h3 text-h3 text-primary">{title}</h2>
      {children ? <p className="whitespace-pre-wrap font-body-md">{children}</p> : <p className="font-body-sm text-on-surface-variant">—</p>}
    </section>
  );
}

function SignatureBlock({
  label,
  name,
  role,
  dataUrl,
  pending,
}: {
  label: string;
  name: string | null;
  role: string;
  dataUrl?: string;
  pending?: boolean;
}) {
  return (
    <div className="text-center">
      <p className="mb-xs text-left font-label-caps text-label-caps uppercase text-on-surface-variant">{label}</p>
      <div className="mb-xs flex h-[72px] items-end justify-center">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- canvas-captured data URL
          <img src={dataUrl} alt={`Signature of ${name ?? role}`} className="max-h-[68px]" />
        ) : (
          <span className="font-body-sm italic text-on-surface-variant">{pending ? 'Awaiting approval' : 'Not signed'}</span>
        )}
      </div>
      <div className="mx-auto w-[80%] border-t border-on-surface-variant pt-xs">
        <p className="font-body-md font-bold">{name ?? '—'}</p>
        <p className="font-caption text-caption text-on-surface-variant">{role}</p>
      </div>
    </div>
  );
}
