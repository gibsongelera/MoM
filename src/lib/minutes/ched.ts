/**
 * CHED-format minutes — the one structure every view of the minutes uses.
 *
 * Follows the order of business prescribed by CHED Administrative Order
 * No. 06, s. 2014 ("Standard Format for Agenda of Meetings of the Governing
 * Boards of SUCs"), applied to ZPPSU college / office meetings:
 *
 *   I.   Preliminaries — A. Call to Order, B. Determination of Quorum,
 *        C. Approval of the Provisional Agenda, D. Approval of the Minutes of
 *        the Previous Meeting, E. Matters Arising from the Previous Meeting,
 *        F. Chairperson's Time, G. Report of the Presiding Officer
 *        (CHED: "President's Report")
 *   II.  New Business — A. Matters for Approval, grouped as 1. Financial/
 *        Fiscal, 2. Academic, 3. Administrative, 4. Policy, 5. Legal
 *   III. Matters for Confirmation
 *   IV.  Other Matters
 *   V.   Adjournment
 *
 * Storage stays backward compatible: call_to_order, previous_minutes and
 * adjournment keep their columns, and everything else lives in the
 * agenda_items jsonb array with a `section` (+ `key` / `category`). Items
 * written before this format have no section and are read as New Business.
 *
 * buildChedDocument() turns a PrintableMeeting into a render-ready tree; the
 * on-screen document, the PDF and the Word file all render that same tree,
 * so the three can't drift apart.
 *
 * Pure (no server or browser APIs) so it can be unit tested and imported
 * anywhere.
 */
import type { PrintableMeeting } from '@/lib/meetings/printable';
import { ATTACHMENT_KIND_LABEL } from '@/lib/meetings/files';
import { fileNameFor } from '@/lib/ai/doc-title';
import { fmtManila, fmtManilaDate, fmtManilaTime } from '@/lib/utils/datetime';

export type ChedSection = 'preliminary' | 'new_business' | 'confirmation' | 'other';
export type ChedCategory = 'financial' | 'academic' | 'administrative' | 'policy' | 'legal';
export type PreliminaryKey = 'quorum' | 'provisional_agenda' | 'matters_arising' | 'chairperson_time' | 'head_report';
export type PreliminaryField = 'call_to_order' | 'previous_minutes' | PreliminaryKey;

/** One stored element of minutes.agenda_items. */
export interface MinutesItem {
  title: string;
  notes: string;
  section?: ChedSection;
  key?: PreliminaryKey;
  category?: ChedCategory | null;
  /** Action taken / resolution / disposition. */
  action?: string;
}

export interface BusinessItem {
  title: string;
  notes: string;
  action: string;
  category: ChedCategory | null;
}

export interface ChedMinutes {
  preliminary: Record<PreliminaryField, string>;
  newBusiness: BusinessItem[];
  confirmation: BusinessItem[];
  other: BusinessItem[];
  adjournment: string;
}

export const PRELIMINARY: { letter: string; field: PreliminaryField; label: string; hint: string }[] = [
  { letter: 'A', field: 'call_to_order', label: 'Call to Order', hint: 'Who presided, and the time the meeting was called to order.' },
  { letter: 'B', field: 'quorum', label: 'Determination of Quorum', hint: 'How many members were present and whether a quorum was declared.' },
  { letter: 'C', field: 'provisional_agenda', label: 'Approval of the Provisional Agenda', hint: 'Whether the agenda was approved as presented or amended (who moved, who seconded).' },
  { letter: 'D', field: 'previous_minutes', label: 'Approval of the Minutes of the Previous Meeting', hint: 'Approved, approved with corrections, deferred — or not applicable.' },
  { letter: 'E', field: 'matters_arising', label: 'Matters Arising from the Previous Meeting', hint: 'Status of earlier decisions and action items (see Annex A, the matrix of action items).' },
  { letter: 'F', field: 'chairperson_time', label: "Chairperson's Time", hint: 'Remarks or announcements of the presiding officer.' },
  { letter: 'G', field: 'head_report', label: 'Report of the Presiding Officer', hint: "CHED: President's Report — accomplishments, developments and matters for the body's information." },
];

export const CATEGORY_ORDER: ChedCategory[] = ['financial', 'academic', 'administrative', 'policy', 'legal'];
export const CATEGORY_LABEL: Record<ChedCategory, string> = {
  financial: 'Financial/Fiscal Matters',
  academic: 'Academic Matters',
  administrative: 'Administrative Matters',
  policy: 'Policy Matters',
  legal: 'Legal Matters',
};

/** Letterhead. The address is printed under the university name. */
export const LETTERHEAD = {
  republic: 'Republic of the Philippines',
  university: 'Zamboanga Peninsula Polytechnic State University',
  address: 'R.T. Lim Boulevard, Zamboanga City',
  zppsuLogo: '/assets/images/ZppsuLogo.png',
  chedLogo: '/assets/images/ched-logo.png',
  basis: 'Order of business per CHED Administrative Order No. 06, s. 2014',
} as const;

const PRELIM_KEYS: PreliminaryKey[] = ['quorum', 'provisional_agenda', 'matters_arising', 'chairperson_time', 'head_report'];

function isCategory(v: unknown): v is ChedCategory {
  return typeof v === 'string' && (CATEGORY_ORDER as string[]).includes(v);
}

export function emptyChedMinutes(): ChedMinutes {
  return {
    preliminary: { call_to_order: '', quorum: '', provisional_agenda: '', previous_minutes: '', matters_arising: '', chairperson_time: '', head_report: '' },
    newBusiness: [],
    confirmation: [],
    other: [],
    adjournment: '',
  };
}

/** Stored row → editable CHED structure. */
export function splitMinutes(row: {
  call_to_order?: string | null;
  previous_minutes?: string | null;
  agenda_items?: MinutesItem[] | null;
  adjournment?: string | null;
}): ChedMinutes {
  const out = emptyChedMinutes();
  out.preliminary.call_to_order = row.call_to_order ?? '';
  out.preliminary.previous_minutes = row.previous_minutes ?? '';
  out.adjournment = row.adjournment ?? '';
  for (const raw of row.agenda_items ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const item: BusinessItem = {
      title: String(raw.title ?? ''),
      notes: String(raw.notes ?? ''),
      action: String(raw.action ?? ''),
      category: isCategory(raw.category) ? raw.category : null,
    };
    if (raw.section === 'preliminary' && raw.key && PRELIM_KEYS.includes(raw.key)) {
      out.preliminary[raw.key] = item.notes;
    } else if (raw.section === 'confirmation') {
      out.confirmation.push(item);
    } else if (raw.section === 'other') {
      out.other.push(item);
    } else {
      out.newBusiness.push(item);
    }
  }
  return out;
}

/** Editable CHED structure → stored row fields (what amend/insert/update write). */
export function joinMinutes(m: ChedMinutes): {
  call_to_order: string;
  previous_minutes: string;
  agenda_items: MinutesItem[];
  adjournment: string;
} {
  const prelim: MinutesItem[] = PRELIM_KEYS.filter((k) => m.preliminary[k].trim()).map((k) => ({
    section: 'preliminary',
    key: k,
    title: PRELIMINARY.find((p) => p.field === k)!.label,
    notes: m.preliminary[k],
  }));
  const pack = (section: ChedSection, items: BusinessItem[]): MinutesItem[] =>
    items
      .filter((i) => i.title.trim() || i.notes.trim() || i.action.trim())
      .map((i) => ({
        section,
        title: i.title.trim() || 'Untitled item',
        notes: i.notes,
        ...(i.action.trim() ? { action: i.action } : {}),
        ...(section === 'new_business' && i.category ? { category: i.category } : {}),
      }));
  return {
    call_to_order: m.preliminary.call_to_order,
    previous_minutes: m.preliminary.previous_minutes,
    agenda_items: [...prelim, ...pack('new_business', m.newBusiness), ...pack('confirmation', m.confirmation), ...pack('other', m.other)],
    adjournment: m.adjournment,
  };
}

/** New Business grouped in CHED order; uncategorised items last. Numbering is sequential over the groups present. */
export function groupNewBusiness(items: BusinessItem[]): { label: string; category: ChedCategory | null; items: BusinessItem[] }[] {
  const groups: { label: string; category: ChedCategory | null; items: BusinessItem[] }[] = [];
  for (const c of CATEGORY_ORDER) {
    const inCat = items.filter((i) => i.category === c);
    if (inCat.length) groups.push({ label: CATEGORY_LABEL[c], category: c, items: inCat });
  }
  const rest = items.filter((i) => !i.category);
  if (rest.length) groups.push({ label: groups.length ? 'Other Business' : 'Matters Taken Up', category: null, items: rest });
  return groups;
}

/** Shape of the AI draft (src/lib/ai/schemas.ts minutesOutput), kept structural to stay import-free. */
export interface AiMinutesDraft {
  callToOrder: string;
  quorum: string;
  provisionalAgenda: string;
  previousMinutes: string;
  mattersArising: string;
  chairpersonTime: string;
  headReport: string;
  newBusiness: { title: string; discussion: string; action: string; category: string }[];
  mattersForConfirmation: { title: string; discussion: string; action: string }[];
  otherMatters: { title: string; discussion: string; action: string }[];
  adjournment: string;
}

/** AI draft → editable CHED minutes. */
export function chedFromAiDraft(d: AiMinutesDraft): ChedMinutes {
  const item = (i: { title: string; discussion: string; action: string; category?: string }): BusinessItem => ({
    title: i.title,
    notes: i.discussion,
    action: i.action,
    category: isCategory(i.category) ? i.category : null,
  });
  return {
    preliminary: {
      call_to_order: d.callToOrder,
      quorum: d.quorum,
      provisional_agenda: d.provisionalAgenda,
      previous_minutes: d.previousMinutes,
      matters_arising: d.mattersArising,
      chairperson_time: d.chairpersonTime,
      head_report: d.headReport,
    },
    newBusiness: d.newBusiness.map(item),
    confirmation: d.mattersForConfirmation.map(item),
    other: d.otherMatters.map(item),
    adjournment: d.adjournment,
  };
}

// ---------------------------------------------------------------------------
// Render-ready document
// ---------------------------------------------------------------------------

export interface DocItem {
  label: string;
  title: string;
  text?: string;
  action?: string;
  children?: DocItem[];
}

export interface DocSection {
  numeral: string;
  title: string;
  text?: string;
  items: DocItem[];
}

export interface DocPerson {
  name: string;
  role: string;
}

export interface DocSignature {
  label: string;
  name: string;
  role: string;
  /** PNG/JPEG data URL, or null when not (yet) signed. */
  image: string | null;
  pendingText: string;
}

export interface ChedDocument {
  draft: boolean;
  draftNote: string | null;
  fileName: string;
  letterhead: { republic: string; university: string; address: string; department: string | null };
  title: string;
  subtitle: string | null;
  meta: { label: string; value: string }[];
  attendance: { present: DocPerson[]; absent: DocPerson[] } | null;
  sections: DocSection[];
  actionMatrix: { no: number; item: string; responsible: string; deadline: string; status: string }[];
  signatures: DocSignature[];
  annexes: { title: string; lines: string[] }[];
  footer: string;
}

const NONE = 'None.';

function sentenceCase(s: string) {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function buildChedDocument(data: PrintableMeeting): ChedDocument {
  const { meeting, minutes } = data;
  const approved = minutes?.status === 'approved' && Boolean(minutes.locked_at);
  const ched = splitMinutes(minutes ?? {});

  const meta: { label: string; value: string }[] = [
    { label: 'Subject', value: data.docTitle },
    { label: 'Date', value: fmtManila(meeting.starts_at, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
    { label: 'Time', value: fmtManilaTime(meeting.starts_at) },
    { label: 'Venue', value: meeting.venue ?? 'Not recorded' },
    { label: 'Presiding', value: data.presidingName ?? 'Not recorded' },
    { label: 'Secretary', value: data.secretaryName ?? 'Not recorded' },
  ];
  if (meeting.is_emergency) meta.push({ label: 'Type', value: 'Emergency (unscheduled) meeting' });
  if (meeting.meeting_type !== 'regular') {
    meta.push({ label: meeting.meeting_type === 'capstone' ? 'Capstone' : 'Research', value: meeting.sub_type ?? sentenceCase(meeting.meeting_type) });
    if (meeting.project_title) meta.push({ label: 'Project', value: meeting.project_title });
    if (meeting.meeting_type === 'capstone' && meeting.chairperson_name) meta.push({ label: 'Chairperson', value: meeting.chairperson_name });
    if (meeting.meeting_type === 'capstone' && meeting.panel.length) {
      meta.push({ label: 'Panel', value: meeting.panel.map((p) => (p.affiliation ? `${p.name} (${p.affiliation})` : p.name)).join('; ') });
    }
    if (meeting.adviser_name) meta.push({ label: 'Adviser', value: meeting.adviser_name });
  }

  const person = (r: { name: string; role: string; kind?: string; userId?: string | null }) => ({
    name: r.name,
    role: `${r.role}${!r.userId && r.kind === 'guest' ? ' (guest)' : ''}`,
  });
  const attendance = data.attendance.length
    ? {
        present: data.attendance.filter((r) => r.present).map(person),
        absent: data.attendance.filter((r) => !r.present && r.kind !== 'walk_in').map(person),
      }
    : null;

  // Quorum: when the secretary wrote nothing, state the recorded count (a fact), never a declaration.
  const quorumText =
    ched.preliminary.quorum.trim() ||
    (attendance ? `${attendance.present.length} of ${attendance.present.length + attendance.absent.length} expected attendees were present.` : '');

  const prelimItems: DocItem[] = PRELIMINARY.map((p) => ({
    label: `${p.letter}.`,
    title: p.label,
    text: (p.field === 'quorum' ? quorumText : ched.preliminary[p.field]).trim() || NONE,
  }));

  const groups = groupNewBusiness(ched.newBusiness);
  const newBusiness: DocItem[] = [
    {
      label: 'A.',
      title: 'Matters for Approval',
      text: groups.length ? undefined : NONE,
      children: groups.map((g, gi) => ({
        label: `${gi + 1}.`,
        title: g.label,
        children: g.items.map((it, ii) => ({
          label: `${gi + 1}.${ii + 1}`,
          title: it.title,
          text: it.notes.trim() || undefined,
          action: it.action.trim() || undefined,
        })),
      })),
    },
  ];

  const numbered = (items: BusinessItem[]): DocItem[] =>
    items.map((it, i) => ({ label: `${i + 1}.`, title: it.title, text: it.notes.trim() || undefined, action: it.action.trim() || undefined }));

  const sections: DocSection[] = [
    { numeral: 'I.', title: 'Preliminaries', items: prelimItems },
    { numeral: 'II.', title: 'New Business', items: newBusiness },
    { numeral: 'III.', title: 'Matters for Confirmation', items: numbered(ched.confirmation), text: ched.confirmation.length ? undefined : NONE },
    { numeral: 'IV.', title: 'Other Matters', items: numbered(ched.other), text: ched.other.length ? undefined : NONE },
    { numeral: 'V.', title: 'Adjournment', items: [], text: ched.adjournment.trim() || NONE },
  ];

  const signatures = minutes?.signatures ?? [];
  const secretarySig = signatures.find((s) => s.kind === 'secretary') ?? signatures.find((s) => /secretary/i.test(s.role));
  const approverSig =
    signatures.find((s) => s.kind === 'approver') ?? signatures.find((s) => /(head|dean|chair|president|administrator)/i.test(s.role));

  const annexes: { title: string; lines: string[] }[] = [];
  if (minutes?.paper_notes?.length) {
    annexes.push({
      title: 'Panel Notes (transcribed from paper)',
      lines: minutes.paper_notes.map((n) => (n.pageOrPanel ? `${n.pageOrPanel}: ${n.note}` : n.note)),
    });
  }
  if (data.attachments.length) {
    annexes.push({
      title: 'Attachments Kept with the Record',
      lines: data.attachments.map((a) => `${ATTACHMENT_KIND_LABEL[a.kind]}: ${a.caption || a.file_name}`),
    });
  }

  const dept = data.department;
  return {
    draft: !approved,
    draftNote: approved ? null : `DRAFT — ${minutes ? sentenceCase(minutes.status) : 'not yet written'}; not the approved record`,
    fileName: fileNameFor({ title: meeting.title, meeting_type: meeting.meeting_type, sub_type: meeting.sub_type, project_title: meeting.project_title, starts_at: meeting.starts_at }),
    letterhead: { republic: LETTERHEAD.republic, university: data.institution || LETTERHEAD.university, address: LETTERHEAD.address, department: dept },
    title: 'Minutes of the Meeting',
    // Only when the subject line doesn't already name the meeting (capstone / research titles).
    subtitle: data.docTitle.toLowerCase().includes(meeting.title.toLowerCase()) ? null : meeting.title,
    meta,
    attendance,
    sections,
    actionMatrix: data.tasks.map((t, i) => ({
      no: i + 1,
      item: t.title,
      responsible: t.assignee ?? 'Unassigned',
      deadline: t.deadline ? fmtManilaDate(`${t.deadline}T00:00:00+08:00`) : '—',
      status: sentenceCase(t.status),
    })),
    signatures: [
      {
        label: 'Prepared by:',
        name: data.secretaryName ?? '',
        role: 'Secretary',
        image: secretarySig?.dataUrl ?? null,
        pendingText: 'Not signed',
      },
      {
        label: 'Noted and approved by:',
        name: data.presidingName ?? '',
        role: dept ? `Head, ${dept}` : 'Department Head',
        image: approved ? (approverSig?.dataUrl ?? null) : null,
        pendingText: 'Awaiting approval',
      },
    ],
    annexes,
    footer: `Minutes of the Meeting${dept ? ` | ${dept}` : ''} | ${fmtManilaDate(meeting.starts_at)}`,
  };
}
