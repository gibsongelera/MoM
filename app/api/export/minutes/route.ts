import { NextRequest, NextResponse } from 'next/server';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
} from 'docx';

export const runtime = 'nodejs';

interface AgendaItem { title: string; notes: string }
interface ActionRow { title: string; assignee: string; deadline: string; status: string }
interface Motion { text: string; result: string; votesFor: number; votesAgainst: number; votesAbstain: number }
interface Body {
  meeting: { title: string; date: string; venue: string; department: string; chair: string; secretary: string };
  minutes: {
    documentTitle?: string;
    callToOrder?: string;
    previousMinutes?: string;
    agendaItems?: AgendaItem[];
    adjournment?: string;
  };
  tasks?: ActionRow[];
  motions?: Motion[];
}

const txt = (text: string, bold = false, italics = false) =>
  new Paragraph({ children: [new TextRun({ text, bold, italics })] });
const cell = (children: Paragraph[], width?: number) =>
  new TableCell({ children, width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined });
const BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
  left: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
  right: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const { meeting, minutes } = body;
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Zamboanga Peninsula Polytechnic State University', bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: meeting.department || '', italics: true })] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun({ text: minutes.documentTitle || 'Minutes of the Meeting' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: meeting.title, italics: true })] }),
    new Paragraph({ text: '' }),
    txt(`Date & Time: ${meeting.date}`),
    txt(`Venue: ${meeting.venue || '—'}`),
    txt(`Presiding Officer: ${meeting.chair || '—'}`),
    txt(`Secretary: ${meeting.secretary || '—'}`),
    new Paragraph({ text: '' }),
  );

  const section = (n: string, title: string, para?: string) => {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: `${n}. ${title}` })] }));
    if (para !== undefined) children.push(txt(para || '—'));
  };

  section('1', 'Call to Order & Attendance', minutes.callToOrder || '');
  section('2', 'Approval of Previous Minutes', minutes.previousMinutes || '');

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '3. Agenda Items & Discussions' })] }));
  (minutes.agendaItems || []).forEach((a, i) => {
    children.push(txt(`${i + 1}. ${a.title}`, true));
    children.push(txt(a.notes || ''));
  });
  if (!(minutes.agendaItems || []).length) children.push(txt('—'));

  // Action items table
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '4. Action Items' })] }));
  const tasks = body.tasks || [];
  if (tasks.length) {
    const header = new TableRow({
      tableHeader: true,
      children: [cell([txt('Task', true)], 45), cell([txt('Assignee', true)], 25), cell([txt('Deadline', true)], 15), cell([txt('Status', true)], 15)],
    });
    const rows = tasks.map((t) => new TableRow({ children: [cell([txt(t.title)]), cell([txt(t.assignee || 'Unassigned')]), cell([txt(t.deadline || '—')]), cell([txt(t.status)])] }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDERS, rows: [header, ...rows] }));
  } else {
    children.push(txt('No action items captured.'));
  }

  // Motions (optional)
  const motions = body.motions || [];
  if (motions.length) {
    children.push(new Paragraph({ text: '' }), new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '5. Motions & Resolutions' })] }));
    motions.forEach((m, i) => {
      children.push(txt(`Motion ${i + 1}: ${m.text}`, true));
      children.push(txt(`Result: ${m.result.toUpperCase()} — For ${m.votesFor}, Against ${m.votesAgainst}, Abstain ${m.votesAbstain}`));
    });
  }

  children.push(new Paragraph({ text: '' }), new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: `${motions.length ? '6' : '5'}. Adjournment` })] }), txt(minutes.adjournment || '—'));

  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({ text: '' }),
    txt('Prepared by: ____________________________'),
    txt(meeting.secretary || '', false, true),
    new Paragraph({ text: '' }),
    txt('Approved by: ____________________________'),
    txt(meeting.chair || '', false, true),
  );

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="minutes.docx"',
    },
  });
}
