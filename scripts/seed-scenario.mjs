#!/usr/bin/env node
/**
 * Seeds the panel-defense demo scenario (client: "gagawa kayo ng isang
 * scenario like gagana lahat" — one scenario where everything works).
 *
 *   node --env-file=.env.local scripts/seed-scenario.mjs
 *
 * Idempotent: fixed ids, upserts. Needs the base demo accounts and
 * departments (scripts/seed-demo.mjs) and migrations 0015–0017. Uses the
 * service role, so database notification triggers stay quiet (no actor).
 *
 * Creates, in CICS:
 *   1. a PAST capstone Mock Defense: typed external chairperson, a linked
 *      panelist from another college plus an external one, a guest observer,
 *      attendance, transcript, approved + signed minutes with panel notes;
 *   2. an UPCOMING capstone Final Presentation (Oct 8, 2:00 PM) with the same
 *      panel — shows on every participant's calendar;
 *   3. a PAST emergency meeting whose minutes await the head's approval, so
 *      approval can be demonstrated live.
 * See docs/demo-scenario.md for the walkthrough.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.');
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const at = (day, time) => new Date(`${day}T${time}:00+08:00`).toISOString();
const ID = {
  mock: '5e1f0000-0000-4000-8000-000000000001',
  final: '5e1f0000-0000-4000-8000-000000000002',
  emergency: '5e1f0000-0000-4000-8000-000000000003',
  mockTranscript: '5e1f0000-0000-4000-8000-000000000011',
  task1: '5e1f0000-0000-4000-8000-000000000021',
  task2: '5e1f0000-0000-4000-8000-000000000022',
  guest: '5e1f0000-0000-4000-8000-000000000031',
};
// 1x1 transparent PNG: stands in for drawn signatures in seeded data.
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function main() {
  const emails = {
    head: 'president@zppsu.edu.ph',
    secretary: 'secretary@zppsu.edu.ph',
    faculty: 'faculty@zppsu.edu.ph',
    f2: 'msantos@zppsu.edu.ph',
    h2: 'amendoza@zppsu.edu.ph',
    st1: 'kmendoza@zppsu.edu.ph',
    st2: 'jaquino@zppsu.edu.ph',
    st3: 'plim@zppsu.edu.ph',
  };
  const profiles = await must('profiles', db.from('profiles').select('id, name, email').in('email', Object.values(emails)));
  const u = {};
  for (const [key, email] of Object.entries(emails)) {
    const p = profiles.find((x) => x.email === email);
    if (!p) throw new Error(`Missing demo account ${email}. Run scripts/seed-demo.mjs first.`);
    u[key] = p;
  }
  const cics = (await must('departments', db.from('departments').select('id').eq('short', 'CICS').single())).id;

  const project = 'SmartMin: AI-Assisted Meeting Governance for ZPPSU';
  const panel = [
    { name: u.h2.name, userId: u.h2.id, affiliation: 'College of Engineering and Technology' },
    { name: 'Engr. Paolo Santiago', affiliation: 'Western Mindanao State University' },
  ];
  const guests = [{ id: ID.guest, name: 'Mr. Carlo Reyes', affiliation: 'Industry partner (observer)' }];
  const base = {
    department_id: cics,
    secretary_id: u.secretary.id,
    chair_id: u.head.id,
    language: 'en-US',
  };

  await must(
    'meetings',
    db.from('meetings').upsert(
      [
        {
          ...base,
          id: ID.mock,
          title: 'Capstone Mock Defense — Group 3',
          starts_at: at('2026-10-01', '14:00'),
          duration_min: 120,
          venue: 'CICS AVR',
          meeting_type: 'capstone',
          sub_type: 'Mock Defense',
          project_title: project,
          chairperson_name: 'Dr. Lorna Villanueva',
          panel_members: panel,
          adviser_name: u.f2.name,
          adviser_id: u.f2.id,
          guests,
          agenda: ['Presentation of the system', 'Questions from the panel', 'Recommendations and verdict'],
          status: 'approved',
          ai_processed: true,
          is_emergency: false,
        },
        {
          ...base,
          id: ID.final,
          title: 'Capstone Final Presentation — Group 3',
          starts_at: at('2026-10-08', '14:00'),
          duration_min: 120,
          venue: 'CICS AVR',
          meeting_type: 'capstone',
          sub_type: 'Final Presentation',
          project_title: project,
          chairperson_name: 'Dr. Lorna Villanueva',
          panel_members: panel,
          adviser_name: u.f2.name,
          adviser_id: u.f2.id,
          guests,
          agenda: ['Final presentation', 'Panel deliberation', 'Verdict'],
          status: 'scheduled',
          ai_processed: false,
          is_emergency: false,
        },
        {
          ...base,
          id: ID.emergency,
          title: 'Emergency meeting — Class suspension advisory',
          starts_at: at('2026-10-02', '16:30'),
          duration_min: 30,
          venue: 'Dean’s Office',
          meeting_type: 'regular',
          sub_type: null,
          project_title: null,
          guests: [],
          panel_members: [],
          agenda: ['Weather advisory and class suspension'],
          status: 'pending_approval',
          ai_processed: false,
          is_emergency: true,
        },
      ],
      { onConflict: 'id' },
    ),
  );

  const participants = [
    ...[ID.mock, ID.final].flatMap((m) =>
      [u.head, u.secretary, u.faculty, u.f2, u.h2, u.st1, u.st2, u.st3].map((p) => ({ meeting_id: m, user_id: p.id })),
    ),
    ...[u.head, u.secretary, u.faculty, u.f2].map((p) => ({ meeting_id: ID.emergency, user_id: p.id })),
  ];
  await must(
    'participants',
    db.from('meeting_participants').upsert(participants, { onConflict: 'meeting_id,user_id', ignoreDuplicates: true }),
  );

  const record = (p, kind, role, present) => ({ key: `u:${p.id}`, userId: p.id, name: p.name, role, kind, present });
  await must(
    'attendance',
    db.from('attendance').upsert(
      [
        {
          meeting_id: ID.mock,
          started_at: Date.parse(at('2026-10-01', '13:55')),
          records: [
            record(u.head, 'approver', 'Department head', true),
            { key: 'g:chair-dr-lorna-villanueva', userId: null, name: 'Dr. Lorna Villanueva', role: 'Chairperson', kind: 'chair', present: true, signatureDataUrl: SIG, signedAt: Date.parse(at('2026-10-01', '13:58')) },
            record(u.h2, 'panel', 'Panel member', true),
            { key: 'g:panel-engr-paolo-santiago', userId: null, name: 'Engr. Paolo Santiago', role: 'Panel member', kind: 'panel', affiliation: 'Western Mindanao State University', present: true },
            record(u.f2, 'adviser', 'Adviser', true),
            record(u.faculty, 'participant', 'Associate Professor', false),
            record(u.st1, 'participant', 'BSCS Student (Capstone)', true),
            record(u.st2, 'participant', 'BSCS Student (Capstone)', true),
            record(u.st3, 'participant', 'BSCS Student (Capstone)', true),
            { key: `g:${ID.guest}`, userId: null, name: 'Mr. Carlo Reyes', role: 'Industry partner (observer)', kind: 'guest', affiliation: 'Industry partner (observer)', present: true },
          ],
        },
        {
          meeting_id: ID.emergency,
          started_at: Date.parse(at('2026-10-02', '16:30')),
          records: [
            record(u.head, 'approver', 'Department head', true),
            record(u.faculty, 'participant', 'Associate Professor', true),
            record(u.f2, 'participant', 'Professor I', true),
          ],
        },
      ],
      { onConflict: 'meeting_id' },
    ),
  );

  await must(
    'transcript',
    db.from('transcripts').upsert(
      {
        id: ID.mockTranscript,
        meeting_id: ID.mock,
        language: 'en',
        segments: [
          { speakerId: 'speaker_0', speaker: 'Dr. Lorna Villanueva', t: 0, text: 'Good afternoon. We now begin the mock defense of Group 3.' },
          { speakerId: 'speaker_1', speaker: 'Karla Mendoza', t: 14, text: 'SmartMin records meetings, transcribes them, and drafts CHED-format minutes.' },
          { speakerId: 'speaker_2', speaker: 'Engr. Paolo Santiago', t: 95, text: 'How do you handle meetings with no internet connection?' },
          { speakerId: 'speaker_1', speaker: 'Karla Mendoza', t: 102, text: 'The secretary keeps the recording on the device and uploads it from the meeting later.' },
          { speakerId: 'speaker_0', speaker: 'Dr. Lorna Villanueva', t: 410, text: 'The panel recommends passing with minor revisions. Please add attachments for paper attendance sheets.' },
        ],
        summary: 'Mock defense of SmartMin. The panel recommended passing with minor revisions.',
      },
      { onConflict: 'id' },
    ),
  );

  await must(
    'minutes',
    db.from('minutes').upsert(
      [
        {
          meeting_id: ID.mock,
          document_title: `Capstone Mock Defense — ${project}`,
          call_to_order: 'The mock defense was called to order at 2:00 PM by the chairperson, Dr. Lorna Villanueva.',
          previous_minutes: 'Not applicable (first defense of the group).',
          agenda_items: [
            { title: 'Presentation of the system', notes: 'The group presented the recording, transcription and minutes workflow.' },
            { title: 'Questions from the panel', notes: 'Offline use, attendance capture and data privacy were discussed.' },
            { title: 'Recommendations and verdict', notes: 'Passed with minor revisions: add attachments for paper attendance sheets; clarify the online requirement in the manuscript.' },
          ],
          adjournment: 'The defense was adjourned at 3:45 PM.',
          status: 'approved',
          locked_at: at('2026-10-02', '09:00'),
          locked_by: u.head.id,
          signatures: [
            { userId: u.secretary.id, name: u.secretary.name, role: 'Faculty Secretary', kind: 'secretary', signedAt: Date.parse(at('2026-10-01', '17:00')), dataUrl: SIG },
            { userId: u.head.id, name: u.head.name, role: 'Head', kind: 'approver', signedAt: Date.parse(at('2026-10-02', '09:00')), dataUrl: SIG },
          ],
          paper_notes: [
            { id: '5e1f0000-0000-4000-8000-000000000041', pageOrPanel: 'Engr. Paolo Santiago', note: 'Add evidence/attachments to each meeting. Clarify that the system needs internet.', readAt: Date.parse(at('2026-10-01', '16:00')) },
          ],
        },
        {
          meeting_id: ID.emergency,
          document_title: 'Minutes of the Emergency meeting — Class suspension advisory',
          call_to_order: 'Called to order at 4:30 PM by the Dean following the weather advisory.',
          previous_minutes: 'Not applicable.',
          agenda_items: [{ title: 'Weather advisory and class suspension', notes: 'Classes suspended for October 3. Faculty to post online activities.' }],
          adjournment: 'Adjourned at 4:55 PM.',
          status: 'pending_approval',
          signatures: [
            { userId: u.secretary.id, name: u.secretary.name, role: 'Faculty Secretary', kind: 'secretary', signedAt: Date.parse(at('2026-10-02', '17:10')), dataUrl: SIG },
          ],
          paper_notes: [],
        },
      ],
      { onConflict: 'meeting_id' },
    ),
  );

  await must(
    'tasks',
    db.from('tasks').upsert(
      [
        { id: ID.task1, title: 'Add attachments for paper attendance sheets', meeting_id: ID.mock, department_id: cics, assignee_id: u.st1.id, delegated_by: u.secretary.id, priority: 'high', deadline: '2026-10-06', status: 'in_progress' },
        { id: ID.task2, title: 'Revise manuscript: state that the system needs internet', meeting_id: ID.mock, department_id: cics, assignee_id: u.st2.id, delegated_by: u.secretary.id, priority: 'medium', deadline: '2026-10-06', status: 'pending' },
      ],
      { onConflict: 'id' },
    ),
  );

  console.log('Demo scenario ready:');
  console.log('  past mock defense (approved, printable), upcoming final presentation (Oct 8, 2:00 PM),');
  console.log('  emergency meeting awaiting the head’s approval. Walkthrough: docs/demo-scenario.md');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
