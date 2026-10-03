/**
 * The official minutes, read-only, in the CHED format (see
 * src/lib/minutes/ched.ts — CHED AO No. 06, s. 2014 order of business):
 * ZPPSU + CHED letterhead, "SUBJECT :"-style details, attendance, sections
 * I–V, signatures, and annexes (matrix of action items, panel notes,
 * attachments). The PDF and Word downloads render the same tree.
 *
 * Server-safe: no hooks, no browser APIs. Used by the print route and the
 * head's approval preview. Until the head approves, every page carries a
 * DRAFT mark, so a printout can never be mistaken for the approved record.
 *
 * Note: the global print stylesheet hides <header> elements (app chrome), so
 * the letterhead is deliberately a <div>.
 */
import type { PrintableMeeting } from '@/lib/meetings/printable';
import { LETTERHEAD, buildChedDocument, type DocItem } from '@/lib/minutes/ched';

export default function MinutesDocument({ data }: { data: PrintableMeeting }) {
  const doc = buildChedDocument(data);

  return (
    <article className="ched-doc ched-paper relative font-[Arial,Helvetica,sans-serif] text-[11pt] leading-snug text-black">
      {doc.draft ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="rotate-[-30deg] select-none text-[120px] font-bold tracking-widest text-primary/10">DRAFT</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-md border-b-[3px] border-double border-primary pb-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- print document: plain img keeps print/PDF output simple */}
        <img src={LETTERHEAD.zppsuLogo} alt="ZPPSU seal" className="h-[84px] w-[84px] shrink-0 object-contain" />
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[10.5pt]">{doc.letterhead.republic}</p>
          <p className="text-[13pt] font-bold uppercase leading-tight text-primary">{doc.letterhead.university}</p>
          <p className="text-[9.5pt] text-[#333]">{doc.letterhead.address}</p>
          {doc.letterhead.department ? <p className="mt-[2px] text-[11pt] font-bold uppercase">{doc.letterhead.department}</p> : null}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- print document: plain img keeps print/PDF output simple */}
        <img src={LETTERHEAD.chedLogo} alt="Commission on Higher Education seal" className="h-[84px] w-[84px] shrink-0 object-contain" />
      </div>

      <div className="mt-md">
        <h1 className="text-[13pt] font-bold uppercase">{doc.title}</h1>
        {doc.draftNote ? <p className="mt-[2px] text-[9pt] font-bold uppercase text-error">{doc.draftNote}</p> : null}
      </div>

      <table className="mt-sm w-full border-collapse text-[10.5pt]">
        <tbody>
          {doc.meta.map((m) => (
            <tr key={m.label} className="align-top">
              <th scope="row" className="w-[118px] py-[1px] pr-sm text-left font-normal uppercase">
                {m.label}
              </th>
              <td className="w-[14px] py-[1px]">:</td>
              <td className={`py-[1px] ${m.label === 'Subject' ? 'font-bold uppercase' : ''}`}>{m.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {doc.subtitle ? <p className="mt-xs text-[10.5pt] italic">{doc.subtitle}</p> : null}
      <hr className="my-sm border-t border-black" />

      <section className="mb-md">
        <h2 className="text-[11pt] font-bold uppercase">Attendance</h2>
        {doc.attendance ? (
          <div className="mt-xs grid grid-cols-1 gap-md text-[10.5pt] sm:grid-cols-2">
            <div>
              <p className="font-bold">Present ({doc.attendance.present.length})</p>
              <ol className="list-decimal pl-lg">
                {doc.attendance.present.map((p, i) => (
                  <li key={i}>
                    {p.name} — <span className="italic">{p.role}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="font-bold">Absent ({doc.attendance.absent.length})</p>
              {doc.attendance.absent.length ? (
                <ol className="list-decimal pl-lg">
                  {doc.attendance.absent.map((p, i) => (
                    <li key={i}>
                      {p.name} — <span className="italic">{p.role}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>None.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[10.5pt]">No attendance was recorded.</p>
        )}
      </section>

      {doc.sections.map((s) => (
        <section key={s.numeral} className="mb-md break-inside-avoid-page">
          <h2 className="border border-black bg-[#f2f2f2] px-sm py-[3px] text-[11pt] font-bold">
            {s.numeral} {s.title}
          </h2>
          <div className="border-x border-b border-black px-md py-sm">
            {s.text ? <p className="whitespace-pre-wrap">{s.text}</p> : null}
            {s.items.map((it) => (
              <Item key={it.label} item={it} depth={0} />
            ))}
          </div>
        </section>
      ))}

      <section className="mt-lg grid grid-cols-1 gap-xl sm:grid-cols-2">
        {doc.signatures.map((sig) => (
          <div key={sig.label}>
            <p className="text-[10.5pt]">{sig.label}</p>
            <div className="flex h-[70px] items-end justify-center">
              {sig.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- canvas-captured data URL
                <img src={sig.image} alt={`Signature of ${sig.name || sig.role}`} className="max-h-[64px]" />
              ) : (
                <span className="text-[9.5pt] italic text-[#555]">{sig.pendingText}</span>
              )}
            </div>
            <div className="border-t border-black pt-[2px] text-center">
              <p className="font-bold uppercase">{sig.name || ' '}</p>
              <p className="text-[10pt]">{sig.role}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-xl break-before-page">
        <h2 className="text-[11pt] font-bold uppercase">Annex A — Matrix of Action Items</h2>
        {doc.actionMatrix.length ? (
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
              {doc.actionMatrix.map((r) => (
                <tr key={r.no} className="align-top">
                  <td className="border border-black px-xs py-[3px]">{r.no}</td>
                  <td className="border border-black px-xs py-[3px]">{r.item}</td>
                  <td className="border border-black px-xs py-[3px]">{r.responsible}</td>
                  <td className="border border-black px-xs py-[3px]">{r.deadline}</td>
                  <td className="border border-black px-xs py-[3px]">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[10.5pt]">No action items were assigned.</p>
        )}
        {doc.annexes.map((a, i) => (
          <div key={a.title} className="mt-md">
            <h2 className="text-[11pt] font-bold uppercase">
              Annex {String.fromCharCode(66 + i)} — {a.title}
            </h2>
            <ol className="mt-xs list-decimal pl-lg text-[10.5pt]">
              {a.lines.map((l, j) => (
                <li key={j} className="whitespace-pre-wrap">
                  {l}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      <p className="mt-xl border-t border-black pt-[2px] text-right text-[8.5pt] text-[#444]">
        {doc.footer} | {LETTERHEAD.basis}
      </p>
    </article>
  );
}

function Item({ item, depth }: { item: DocItem; depth: number }) {
  return (
    <div className={depth === 0 ? 'mt-sm' : 'mt-xs pl-lg'}>
      <p className="font-bold">
        <span className="inline-block min-w-[2.2em]">{item.label}</span>
        {item.title}
      </p>
      {item.text ? <p className="whitespace-pre-wrap pl-[2.2em]">{item.text}</p> : null}
      {item.action ? (
        <p className="whitespace-pre-wrap pl-[2.2em]">
          <span className="font-bold italic">Action taken: </span>
          {item.action}
        </p>
      ) : null}
      {item.children?.map((c) => (
        <Item key={c.label} item={c} depth={depth + 1} />
      ))}
    </div>
  );
}
