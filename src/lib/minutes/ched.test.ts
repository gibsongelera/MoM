import { describe, expect, it } from 'vitest';
import type { PrintableMeeting } from '@/lib/meetings/printable';
import { buildChedDocument, emptyChedMinutes, groupNewBusiness, joinMinutes, splitMinutes } from './ched';

describe('splitMinutes / joinMinutes', () => {
  it('reads minutes written before the CHED format as New Business', () => {
    const m = splitMinutes({
      call_to_order: 'Called to order at 2:05 PM.',
      previous_minutes: 'Approved.',
      agenda_items: [{ title: 'Grades', notes: 'Discussed.' }],
      adjournment: 'Adjourned at 3:00 PM.',
    });
    expect(m.preliminary.call_to_order).toMatch(/2:05/);
    expect(m.newBusiness).toEqual([{ title: 'Grades', notes: 'Discussed.', action: '', category: null }]);
  });

  it('round-trips every section', () => {
    const m = emptyChedMinutes();
    m.preliminary.call_to_order = 'A';
    m.preliminary.quorum = 'Quorum declared.';
    m.preliminary.head_report = 'Enrollment is up.';
    m.newBusiness = [{ title: 'Budget', notes: 'n', action: 'Approved.', category: 'financial' }];
    m.confirmation = [{ title: 'MOA', notes: '', action: 'Confirmed.', category: null }];
    m.other = [{ title: 'Outing', notes: 'Oct 20', action: '', category: null }];
    m.adjournment = 'Z';
    const stored = joinMinutes(m);
    expect(stored.agenda_items.map((i) => i.section)).toEqual(['preliminary', 'preliminary', 'new_business', 'confirmation', 'other']);
    expect(splitMinutes(stored)).toEqual(m);
  });

  it('drops completely empty rows when saving', () => {
    const m = emptyChedMinutes();
    m.newBusiness = [{ title: ' ', notes: '', action: '', category: null }];
    expect(joinMinutes(m).agenda_items).toEqual([]);
  });
});

describe('groupNewBusiness', () => {
  it('orders groups like CHED AO 06 s. 2014 and puts uncategorised items last', () => {
    const groups = groupNewBusiness([
      { title: 'x', notes: '', action: '', category: null },
      { title: 'y', notes: '', action: '', category: 'legal' },
      { title: 'z', notes: '', action: '', category: 'financial' },
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Financial/Fiscal Matters', 'Legal Matters', 'Other Business']);
  });
});

function printable(overrides: Partial<PrintableMeeting> = {}): PrintableMeeting {
  return {
    institution: 'Zamboanga Peninsula Polytechnic State University',
    department: 'College of Information and Computing Sciences',
    docTitle: 'Minutes of the Faculty Meeting',
    meeting: {
      id: 'm1',
      title: 'Faculty Meeting',
      starts_at: '2026-10-08T06:00:00Z',
      venue: 'CICS AVR',
      meeting_type: 'regular',
      sub_type: null,
      project_title: null,
      is_emergency: false,
      chairperson_name: null,
      adviser_name: null,
      panel: [],
    },
    presidingName: 'Engr. Ricardo Gomez',
    secretaryName: 'Maria Cruz',
    minutes: {
      status: 'draft',
      call_to_order: 'Called to order at 2:05 PM.',
      previous_minutes: '',
      agenda_items: [{ title: 'Budget', notes: 'Presented.', action: 'Approved.', category: 'financial', section: 'new_business' }] as never,
      adjournment: '',
      signatures: [],
      paper_notes: [],
      locked_at: null,
    },
    tasks: [{ title: 'Submit grades', assignee: 'Prof. Reyes', deadline: '2026-10-10', status: 'pending' }],
    attendance: [
      { key: 'u:1', userId: '1', name: 'Maria Cruz', role: 'Secretary', kind: 'participant', present: true },
      { key: 'u:2', userId: '2', name: 'Juan Dela Cruz', role: 'Faculty', kind: 'participant', present: false },
    ],
    attachments: [],
    ...overrides,
  } as PrintableMeeting;
}

describe('buildChedDocument', () => {
  it('lays out sections I–V with CHED lettering and a draft mark until approved', () => {
    const doc = buildChedDocument(printable());
    expect(doc.draft).toBe(true);
    expect(doc.sections.map((s) => `${s.numeral} ${s.title}`)).toEqual([
      'I. Preliminaries',
      'II. New Business',
      'III. Matters for Confirmation',
      'IV. Other Matters',
      'V. Adjournment',
    ]);
    expect(doc.sections[0].items.map((i) => i.label)).toEqual(['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.']);
    const approval = doc.sections[1].items[0];
    expect(approval.children?.[0].title).toBe('Financial/Fiscal Matters');
    expect(approval.children?.[0].children?.[0]).toMatchObject({ label: '1.1', title: 'Budget', action: 'Approved.' });
  });

  it('states the recorded head-count for quorum when nothing was written, and fills blanks with "None."', () => {
    const doc = buildChedDocument(printable());
    expect(doc.sections[0].items[1].text).toBe('1 of 2 expected attendees were present.');
    expect(doc.sections[0].items[3].text).toBe('None.');
    expect(doc.sections[4].text).toBe('None.');
  });

  it('shows the head’s signature only once the minutes are approved and locked', () => {
    const sig = { userId: 'h', name: 'Engr. Ricardo Gomez', role: 'Head', kind: 'approver' as const, signedAt: 1, dataUrl: 'data:image/png;base64,AAA' };
    const draft = buildChedDocument(printable({ minutes: { ...printable().minutes!, signatures: [sig] } }));
    expect(draft.signatures[1].image).toBeNull();
    const approved = buildChedDocument(printable({ minutes: { ...printable().minutes!, signatures: [sig], status: 'approved', locked_at: '2026-10-09T00:00:00Z' } }));
    expect(approved.draft).toBe(false);
    expect(approved.signatures[1].image).toBe(sig.dataUrl);
  });

  it('builds the action-item matrix (Annex A)', () => {
    const doc = buildChedDocument(printable());
    expect(doc.actionMatrix).toEqual([{ no: 1, item: 'Submit grades', responsible: 'Prof. Reyes', deadline: 'Oct 10, 2026', status: 'Pending' }]);
  });
});
