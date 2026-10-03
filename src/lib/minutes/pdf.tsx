/**
 * PDF download of the CHED-format minutes (@react-pdf/renderer), rendered on
 * the server from the same ChedDocument tree as the on-screen document and
 * the Word file. A4, Helvetica (the PDF standard Arial equivalent — CHED
 * memoranda are set in Arial), ZPPSU + CHED letterhead, page numbers, and a
 * DRAFT watermark on every page until the head approves.
 */
/* eslint-disable jsx-a11y/alt-text -- @react-pdf <Image> is a PDF primitive, not an HTML img; it has no alt prop. */
import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { LETTERHEAD, type ChedDocument, type DocItem } from './ched';

const MAROON = '#570000';

// Official names and headings must not be hyphenated across lines ("UNIVER-SITY").
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 54, paddingHorizontal: 54, fontFamily: 'Helvetica', fontSize: 10.5, lineHeight: 1.35, color: '#000' },
  letterhead: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2.5, borderBottomColor: MAROON, paddingBottom: 6 },
  logo: { width: 64, height: 64 },
  lhText: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  republic: { fontSize: 10 },
  university: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: MAROON, textTransform: 'uppercase', textAlign: 'center' },
  address: { fontSize: 9, color: '#333' },
  dept: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginTop: 2, textAlign: 'center' },
  thinRule: { borderBottomWidth: 0.75, borderBottomColor: MAROON, marginTop: 1.5 },
  title: { marginTop: 12, fontSize: 12.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  draftNote: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#ba1a1a', textTransform: 'uppercase', marginTop: 2 },
  metaRow: { flexDirection: 'row', marginTop: 1.5 },
  metaLabel: { width: 92, textTransform: 'uppercase' },
  metaColon: { width: 12 },
  metaValue: { flex: 1 },
  bold: { fontFamily: 'Helvetica-Bold' },
  italic: { fontFamily: 'Helvetica-Oblique' },
  boldItalic: { fontFamily: 'Helvetica-BoldOblique' },
  rule: { borderBottomWidth: 0.75, borderBottomColor: '#000', marginVertical: 8 },
  h2: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 3 },
  cols: { flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  sectionHead: { borderWidth: 0.75, borderColor: '#000', backgroundColor: '#f2f2f2', paddingVertical: 3, paddingHorizontal: 6, fontFamily: 'Helvetica-Bold', fontSize: 10.5 },
  sectionBody: { borderWidth: 0.75, borderTopWidth: 0, borderColor: '#000', paddingVertical: 6, paddingHorizontal: 10, marginBottom: 10 },
  itemTitle: { flexDirection: 'row', fontFamily: 'Helvetica-Bold' },
  itemLabel: { width: 26 },
  indented: { paddingLeft: 26 },
  sigRow: { flexDirection: 'row', gap: 36, marginTop: 18 },
  sig: { flex: 1 },
  sigImageBox: { height: 54, alignItems: 'center', justifyContent: 'flex-end' },
  sigImage: { maxHeight: 50, maxWidth: 160, objectFit: 'contain' },
  sigName: { borderTopWidth: 0.75, borderTopColor: '#000', paddingTop: 2, textAlign: 'center', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  sigRole: { textAlign: 'center', fontSize: 9.5 },
  table: { borderWidth: 0.75, borderColor: '#000', marginTop: 4 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: '#000' },
  th: { fontFamily: 'Helvetica-Bold', backgroundColor: '#f2f2f2' },
  td: { padding: 3, borderRightWidth: 0.75, borderRightColor: '#000', fontSize: 9.5 },
  // Pinned from the top: a fixed element positioned with `bottom` lands off-page in @react-pdf.
  footer: { position: 'absolute', top: 806, left: 54, right: 54, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#000', paddingTop: 3, fontSize: 7.5, color: '#444' },
  watermark: { position: 'absolute', top: 330, left: 60, fontSize: 110, fontFamily: 'Helvetica-Bold', color: MAROON, opacity: 0.08, transform: 'rotate(-30deg)' },
});

const COLS = [
  { key: 'no', head: 'No.', width: '7%' },
  { key: 'item', head: 'Action item', width: '41%' },
  { key: 'responsible', head: 'Responsible', width: '20%' },
  { key: 'deadline', head: 'Deadline', width: '16%' },
  { key: 'status', head: 'Status', width: '16%' },
] as const;

function Item({ item, depth }: { item: DocItem; depth: number }) {
  return (
    <View style={{ marginTop: depth === 0 ? 5 : 3, paddingLeft: depth === 0 ? 0 : 16 }} wrap>
      <View style={s.itemTitle} minPresenceAhead={24}>
        <Text style={s.itemLabel}>{item.label}</Text>
        <Text style={{ flex: 1 }}>{item.title}</Text>
      </View>
      {item.text ? <Text style={s.indented}>{item.text}</Text> : null}
      {item.action ? (
        <Text style={s.indented}>
          <Text style={s.boldItalic}>Action taken: </Text>
          {item.action}
        </Text>
      ) : null}
      {item.children?.map((c) => <Item key={c.label} item={c} depth={depth + 1} />)}
    </View>
  );
}

function MinutesPdf({ doc, logos }: { doc: ChedDocument; logos: { zppsu: Buffer; ched: Buffer } }) {
  return (
    <Document title={doc.fileName} author={doc.letterhead.university} subject={doc.title} creator="ZPPSU SmartMin" producer="ZPPSU SmartMin">
      <Page size="A4" style={s.page}>
        {doc.draft ? (
          <Text style={s.watermark} fixed>
            DRAFT
          </Text>
        ) : null}

        <View style={s.letterhead}>
          <Image src={{ data: logos.zppsu, format: 'png' }} style={s.logo} />
          <View style={s.lhText}>
            <Text style={s.republic}>{doc.letterhead.republic}</Text>
            <Text style={s.university}>{doc.letterhead.university}</Text>
            <Text style={s.address}>{doc.letterhead.address}</Text>
            {doc.letterhead.department ? <Text style={s.dept}>{doc.letterhead.department}</Text> : null}
          </View>
          <Image src={{ data: logos.ched, format: 'png' }} style={s.logo} />
        </View>
        <View style={s.thinRule} />

        <Text style={s.title}>{doc.title}</Text>
        {doc.draftNote ? <Text style={s.draftNote}>{doc.draftNote}</Text> : null}
        <View style={{ marginTop: 6 }}>
          {doc.meta.map((m) => (
            <View key={m.label} style={s.metaRow}>
              <Text style={s.metaLabel}>{m.label}</Text>
              <Text style={s.metaColon}>:</Text>
              <Text style={[s.metaValue, m.label === 'Subject' ? { fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' } : {}]}>{m.value}</Text>
            </View>
          ))}
          {doc.subtitle ? <Text style={[s.italic, { marginTop: 3 }]}>{doc.subtitle}</Text> : null}
        </View>
        <View style={s.rule} />

        <Text style={s.h2}>Attendance</Text>
        {doc.attendance ? (
          <View style={[s.cols, { marginBottom: 10 }]}>
            {(
              [
                ['Present', doc.attendance.present],
                ['Absent', doc.attendance.absent],
              ] as const
            ).map(([label, people]) => (
              <View key={label} style={s.col}>
                <Text style={s.bold}>
                  {label} ({people.length})
                </Text>
                {people.length ? (
                  people.map((p, i) => (
                    <Text key={i}>
                      {i + 1}. {p.name} — <Text style={s.italic}>{p.role}</Text>
                    </Text>
                  ))
                ) : (
                  <Text>None.</Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ marginBottom: 10 }}>No attendance was recorded.</Text>
        )}

        {doc.sections.map((sec) => (
          <View key={sec.numeral} wrap>
            <Text style={s.sectionHead} minPresenceAhead={40}>
              {sec.numeral} {sec.title}
            </Text>
            <View style={s.sectionBody}>
              {sec.text ? <Text>{sec.text}</Text> : null}
              {sec.items.map((it) => (
                <Item key={it.label} item={it} depth={0} />
              ))}
            </View>
          </View>
        ))}

        <View style={s.sigRow} wrap={false}>
          {doc.signatures.map((sig) => (
            <View key={sig.label} style={s.sig}>
              <Text>{sig.label}</Text>
              <View style={s.sigImageBox}>
                {sig.image ? <Image src={sig.image} style={s.sigImage} /> : <Text style={[s.italic, { fontSize: 9, color: '#555' }]}>{sig.pendingText}</Text>}
              </View>
              <Text style={s.sigName}>{sig.name || ' '}</Text>
              <Text style={s.sigRole}>{sig.role}</Text>
            </View>
          ))}
        </View>

        <View break>
          <Text style={s.h2}>Annex A — Matrix of Action Items</Text>
          {doc.actionMatrix.length ? (
            <View style={s.table}>
              <View style={[s.tr, s.th]} fixed>
                {COLS.map((c, i) => (
                  <Text key={c.key} style={[s.td, { width: c.width }, i === COLS.length - 1 ? { borderRightWidth: 0 } : {}]}>
                    {c.head}
                  </Text>
                ))}
              </View>
              {doc.actionMatrix.map((r, ri) => (
                <View key={r.no} style={[s.tr, ri === doc.actionMatrix.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
                  {COLS.map((c, i) => (
                    <Text key={c.key} style={[s.td, { width: c.width }, i === COLS.length - 1 ? { borderRightWidth: 0 } : {}]}>
                      {String(r[c.key])}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ) : (
            <Text>No action items were assigned.</Text>
          )}

          {doc.annexes.map((a, i) => (
            <View key={a.title} style={{ marginTop: 12 }}>
              <Text style={s.h2}>
                Annex {String.fromCharCode(66 + i)} — {a.title}
              </Text>
              {a.lines.map((l, j) => (
                <Text key={j}>
                  {j + 1}. {l}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={s.footer} fixed>
          <Text>{doc.footer}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

async function loadLogos() {
  const pub = path.join(process.cwd(), 'public');
  const [zppsu, ched] = await Promise.all([readFile(path.join(pub, LETTERHEAD.zppsuLogo)), readFile(path.join(pub, LETTERHEAD.chedLogo))]);
  return { zppsu, ched };
}

export async function renderMinutesPdf(doc: ChedDocument): Promise<Buffer> {
  return renderToBuffer(<MinutesPdf doc={doc} logos={await loadLogos()} />);
}
