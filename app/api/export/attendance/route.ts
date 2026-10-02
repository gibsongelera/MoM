import { NextRequest, NextResponse } from 'next/server';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, ImageRun, BorderStyle } from 'docx';

export const runtime = 'nodejs';

interface Rec {
  name: string;
  role: string;
  present: boolean;
  signatureDataUrl?: string;
}
interface Body {
  title: string;
  meeting: { title: string; date: string; venue: string; department: string };
  records: Rec[];
}

function cell(children: (Paragraph)[], width?: number) {
  return new TableCell({ children, width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined });
}
function txt(text: string, bold = false) {
  return new Paragraph({ children: [new TextRun({ text, bold })] });
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: [cell([txt('Name', true)], 35), cell([txt('Role', true)], 25), cell([txt('Present', true)], 15), cell([txt('Signature', true)], 25)],
  });

  const rows = body.records.map((r) => {
    let sigPara: Paragraph;
    const m = r.signatureDataUrl?.match(/^data:image\/png;base64,(.+)$/);
    if (m) {
      const buf = Buffer.from(m[1], 'base64');
      sigPara = new Paragraph({ children: [new ImageRun({ data: buf, transformation: { width: 120, height: 45 }, type: 'png' })] });
    } else {
      sigPara = txt(r.present ? '__________' : '');
    }
    return new TableRow({ children: [cell([txt(r.name)]), cell([txt(r.role)]), cell([txt(r.present ? 'Yes' : 'No')]), cell([sigPara])] });
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Zamboanga Peninsula Polytechnic State University', bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: body.meeting.department || '', italics: true })] }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Attendance Sheet' })] }),
          txt(`Meeting: ${body.meeting.title}`),
          txt(`Date & Time: ${body.meeting.date}`),
          txt(`Venue: ${body.meeting.venue || '—'}`),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
              left: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
              right: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
            },
            rows: [headerRow, ...rows],
          }),
          new Paragraph({ text: '' }),
          txt(`Total present: ${body.records.filter((r) => r.present).length} of ${body.records.length}`),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '' }),
          txt('Prepared by: ____________________________'),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="attendance.docx"',
    },
  });
}
