/**
 * Word (.docx) download of the CHED-format minutes, from the same
 * ChedDocument tree as the PDF and the on-screen document. Arial throughout
 * (the CHED memorandum face), A4, the ZPPSU + CHED letterhead in the page
 * header (so it repeats on every page), "Page X of Y" in the footer, and a
 * DRAFT line under the title until the head approves.
 *
 * Kept editable on purpose: offices often adjust minutes in Word before
 * filing; the approved record in SmartMin stays the source of truth.
 */
import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
  type IParagraphOptions,
} from 'docx';
import { LETTERHEAD, type ChedDocument, type DocItem } from './ched';

const FONT = 'Arial';
const MAROON = '570000';
const SIZE = 21; // half-points → 10.5 pt
const NONE_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const NO_BORDERS = { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER, insideHorizontal: NONE_BORDER, insideVertical: NONE_BORDER };
const LINE = { style: BorderStyle.SINGLE, size: 6, color: '000000' } as const;
const BOX = { top: LINE, bottom: LINE, left: LINE, right: LINE };
const DATA_URL = /^data:image\/(png|jpe?g);base64,(.+)$/i;

function run(text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({ text, font: FONT, size: opts.size ?? SIZE, bold: opts.bold, italics: opts.italics, color: opts.color });
}

/** Multi-line text → one paragraph with line breaks. */
function para(text: string, opts: IParagraphOptions & { bold?: boolean; italics?: boolean; size?: number } = {}) {
  const { bold, italics, size, ...rest } = opts;
  return new Paragraph({
    spacing: { after: 60 },
    ...rest,
    children: text.split('\n').map((l, i) => new TextRun({ text: l, font: FONT, size: size ?? SIZE, bold, italics, break: i > 0 ? 1 : undefined })),
  });
}

function dataUrlToImage(dataUrl: string): { data: Buffer; type: 'png' | 'jpg' } | null {
  const m = dataUrl.match(DATA_URL);
  if (!m) return null;
  return { data: Buffer.from(m[2], 'base64'), type: m[1].toLowerCase() === 'png' ? 'png' : 'jpg' };
}

function itemParagraphs(item: DocItem, depth: number): Paragraph[] {
  const indent = 360 * depth; // twips
  const hanging = 500;
  const out: Paragraph[] = [
    new Paragraph({
      spacing: { before: depth === 0 ? 120 : 60, after: 40 },
      indent: { left: indent + hanging, hanging },
      tabStops: [{ type: TabStopType.LEFT, position: indent + hanging }],
      keepNext: true,
      children: [run(`${item.label}\t`, { bold: true }), run(item.title, { bold: true })],
    }),
  ];
  if (item.text) out.push(para(item.text, { indent: { left: indent + hanging } }));
  if (item.action) {
    out.push(
      new Paragraph({
        spacing: { after: 60 },
        indent: { left: indent + hanging },
        children: [
          run('Action taken: ', { bold: true, italics: true }),
          ...item.action.split('\n').map((l, i) => new TextRun({ text: l, font: FONT, size: SIZE, break: i > 0 ? 1 : undefined })),
        ],
      }),
    );
  }
  for (const c of item.children ?? []) out.push(...itemParagraphs(c, depth + 1));
  return out;
}

function boxedSection(title: string, body: Paragraph[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            borders: BOX,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' },
            margins: { top: 40, bottom: 40, left: 100, right: 100 },
            children: [new Paragraph({ children: [run(title, { bold: true })] })],
          }),
        ],
      }),
      new TableRow({
        children: [new TableCell({ borders: BOX, margins: { top: 80, bottom: 120, left: 200, right: 160 }, children: body.length ? body : [new Paragraph('')] })],
      }),
    ],
  });
}

async function loadLogos() {
  const pub = path.join(process.cwd(), 'public');
  const [zppsu, ched] = await Promise.all([readFile(path.join(pub, LETTERHEAD.zppsuLogo)), readFile(path.join(pub, LETTERHEAD.chedLogo))]);
  return { zppsu, ched };
}

export async function renderMinutesDocx(doc: ChedDocument): Promise<Buffer> {
  const logos = await loadLogos();
  const logo = (data: Buffer) => new ImageRun({ type: 'png', data, transformation: { width: 72, height: 72 } });

  const letterhead = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [logo(logos.zppsu)] })],
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(doc.letterhead.republic, { size: 20 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(doc.letterhead.university.toUpperCase(), { bold: true, size: 25, color: MAROON })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(doc.letterhead.address, { size: 18, color: '333333' })] }),
              ...(doc.letterhead.department
                ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 20 }, children: [run(doc.letterhead.department.toUpperCase(), { bold: true, size: 21 })] })]
                : []),
            ],
          }),
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [logo(logos.ched)] })],
          }),
        ],
      }),
    ],
  });

  const header = new Header({
    children: [letterhead, new Paragraph({ border: { bottom: { style: BorderStyle.DOUBLE, size: 8, color: MAROON, space: 1 } }, spacing: { after: 120 }, children: [] })],
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 2 } },
        tabStops: [{ type: TabStopType.RIGHT, position: 9500 }],
        children: [
          run(doc.footer, { size: 15, color: '444444' }),
          new TextRun({ children: ['\tPage ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], font: FONT, size: 15, color: '444444' }),
        ],
      }),
    ],
  });

  const body: (Paragraph | Table)[] = [];
  body.push(new Paragraph({ spacing: { after: 20 }, children: [run(doc.title.toUpperCase(), { bold: true, size: 25 })] }));
  if (doc.draftNote) body.push(new Paragraph({ spacing: { after: 80 }, children: [run(doc.draftNote.toUpperCase(), { bold: true, size: 17, color: 'BA1A1A' })] }));

  body.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      rows: doc.meta.map(
        (m) =>
          new TableRow({
            children: [
              new TableCell({ width: { size: 19, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, children: [new Paragraph({ children: [run(m.label.toUpperCase())] })] }),
              new TableCell({ width: { size: 3, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, children: [new Paragraph({ children: [run(':')] })] }),
              new TableCell({
                width: { size: 78, type: WidthType.PERCENTAGE },
                borders: NO_BORDERS,
                children: [new Paragraph({ children: [run(m.label === 'Subject' ? m.value.toUpperCase() : m.value, { bold: m.label === 'Subject' })] })],
              }),
            ],
          }),
      ),
    }),
  );
  if (doc.subtitle) body.push(para(doc.subtitle, { italics: true, spacing: { before: 60 } }));
  body.push(new Paragraph({ border: { bottom: LINE }, spacing: { after: 160 }, children: [] }));

  body.push(new Paragraph({ spacing: { after: 60 }, children: [run('ATTENDANCE', { bold: true })] }));
  if (doc.attendance) {
    const list = (label: string, people: { name: string; role: string }[]) => [
      new Paragraph({ children: [run(`${label} (${people.length})`, { bold: true })] }),
      ...(people.length
        ? people.map((p, i) => new Paragraph({ children: [run(`${i + 1}. ${p.name} — `), run(p.role, { italics: true })] }))
        : [new Paragraph({ children: [run('None.')] })]),
    ];
    body.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, children: list('Present', doc.attendance.present) }),
              new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, children: list('Absent', doc.attendance.absent) }),
            ],
          }),
        ],
      }),
    );
  } else {
    body.push(para('No attendance was recorded.'));
  }
  body.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

  for (const sec of doc.sections) {
    const content: Paragraph[] = [];
    if (sec.text) content.push(para(sec.text));
    for (const it of sec.items) content.push(...itemParagraphs(it, 0));
    body.push(boxedSection(`${sec.numeral} ${sec.title}`, content));
    body.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  }

  // Signatures
  body.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          cantSplit: true,
          children: doc.signatures.map((sig) => {
            const img = sig.image ? dataUrlToImage(sig.image) : null;
            return new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: NO_BORDERS,
              margins: { left: 100, right: 300 },
              children: [
                new Paragraph({ spacing: { before: 240 }, children: [run(sig.label)] }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  // Room for a wet signature on the printed copy.
                  spacing: { before: 480 },
                  children: img
                    ? [new ImageRun({ type: img.type, data: img.data, transformation: { width: 150, height: 50 } })]
                    : [run(sig.pendingText, { italics: true, size: 18, color: '555555' })],
                }),
                new Paragraph({ alignment: AlignmentType.CENTER, border: { top: LINE }, children: [run((sig.name || ' ').toUpperCase(), { bold: true })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run(sig.role, { size: 20 })] }),
              ],
            });
          }),
        }),
      ],
    }),
  );

  // Annex A — matrix of action items, on a new page.
  body.push(new Paragraph({ pageBreakBefore: true, spacing: { after: 80 }, children: [run('ANNEX A — MATRIX OF ACTION ITEMS', { bold: true })] }));
  if (doc.actionMatrix.length) {
    const widths = [7, 41, 20, 16, 16];
    const cell = (text: string, w: number, head = false) =>
      new TableCell({
        width: { size: w, type: WidthType.PERCENTAGE },
        borders: BOX,
        shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' } : undefined,
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
        children: [new Paragraph({ children: [run(text, { bold: head, size: 19 })] })],
      });
    body.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: ['No.', 'Action item', 'Responsible', 'Deadline', 'Status'].map((h, i) => cell(h, widths[i], true)) }),
          ...doc.actionMatrix.map((r) => new TableRow({ cantSplit: true, children: [String(r.no), r.item, r.responsible, r.deadline, r.status].map((v, i) => cell(v, widths[i])) })),
        ],
      }),
    );
  } else {
    body.push(para('No action items were assigned.'));
  }
  doc.annexes.forEach((a, i) => {
    body.push(new Paragraph({ spacing: { before: 240, after: 80 }, children: [run(`ANNEX ${String.fromCharCode(66 + i)} — ${a.title.toUpperCase()}`, { bold: true })] }));
    a.lines.forEach((l, j) => body.push(para(`${j + 1}. ${l}`)));
  });

  const document = new Document({
    creator: 'ZPPSU SmartMin',
    title: doc.fileName,
    description: doc.title,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 2100, bottom: 1100, left: 1200, right: 1200, header: 500, footer: 500 },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(document);
}
