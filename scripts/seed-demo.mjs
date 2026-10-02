#!/usr/bin/env node
/**
 * Creates the demo accounts and their content.
 *
 *   node --env-file=.env.local scripts/seed-demo.mjs
 *   node --env-file=.env.local scripts/seed-demo.mjs --reset
 *
 * Port of assets/js/seed.js. Runs with the service-role key, so it bypasses RLS
 * and can create auth users — never import anything from here into the app.
 *
 * Accounts are created with email_confirm: true. The @zppsu.edu.ph addresses do
 * not receive mail, so a confirmation link would strand every demo login.
 *
 * Idempotent: existing users are reused, content is keyed on natural columns.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'The service-role key is in the Supabase dashboard under\n' +
      'Project Settings -> API Keys -> service_role. Put it in .env.local.',
  );
  process.exit(1);
}

const RESET = process.argv.includes('--reset');
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

/** Philippine time, so the seeded schedule reads correctly in the UI. */
const PH = '+08:00';
const at = (day, time) => `${day}T${time}:00${PH}`;
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const msAgo = (h) => Date.now() - h * 3600_000;

// ---------------------------------------------------------------------------
// Accounts. Passwords match the chips on the login page.
// ---------------------------------------------------------------------------
const USERS = [
  { key: 'admin',     email: 'admin@zppsu.edu.ph',       password: 'admin123', name: 'Dr. Elena Dominguez',      role: 'admin',     dept: 'ICT',  position: 'System Administrator',     joined: '2023-08-10' },
  { key: 'head',      email: 'president@zppsu.edu.ph',   password: 'head123',  name: 'Engr. Ricardo Gomez',      role: 'head',      dept: 'CICS', position: 'College Dean (CICS)',      joined: '2022-06-01' },
  { key: 'secretary', email: 'secretary@zppsu.edu.ph',   password: 'sec123',   name: 'Sarah Torres',             role: 'secretary', dept: 'CICS', position: 'Faculty Secretary (CICS)', joined: '2024-01-15' },
  { key: 'faculty',   email: 'faculty@zppsu.edu.ph',     password: 'fac123',   name: 'Prof. Juan Dela Cruz',     role: 'faculty',   dept: 'CICS', position: 'Associate Professor',      joined: '2023-09-01' },

  { key: 'f2',  email: 'msantos@zppsu.edu.ph',     password: 'fac123',  name: 'Dr. Maria Santos',          role: 'faculty',   dept: 'CICS', position: 'Professor I',        joined: '2022-08-12' },
  { key: 'f3',  email: 'mreyes@zppsu.edu.ph',      password: 'fac123',  name: 'Prof. Mark Reyes',          role: 'faculty',   dept: 'CICS', position: 'Instructor III',     joined: '2024-02-01' },
  { key: 'f4',  email: 'avillanueva@zppsu.edu.ph', password: 'fac123',  name: 'Prof. Antonette Villanueva', role: 'faculty',  dept: 'CICS', position: 'Assistant Professor', joined: '2023-03-20' },
  { key: 'f5',  email: 'lreyes@zppsu.edu.ph',      password: 'fac123',  name: 'Engr. Liza Reyes',          role: 'faculty',   dept: 'CET',  position: 'Instructor II',      joined: '2024-08-01' },
  { key: 'h2',  email: 'amendoza@zppsu.edu.ph',    password: 'head123', name: 'Dr. Antonio Mendoza',       role: 'head',      dept: 'CET',  position: 'College Dean (CET)', joined: '2021-06-01' },
  { key: 's2',  email: 'jluna@zppsu.edu.ph',       password: 'sec123',  name: 'James Luna',                role: 'secretary', dept: 'CET',  position: 'Secretary (CET)',    joined: '2024-05-01' },

  { key: 'st1', email: 'kmendoza@zppsu.edu.ph', password: 'fac123', name: 'Karla Mendoza', role: 'faculty', dept: 'CICS', position: 'BSCS Student (Capstone)', joined: '2024-08-15' },
  { key: 'st2', email: 'jaquino@zppsu.edu.ph',  password: 'fac123', name: 'Joshua Aquino',  role: 'faculty', dept: 'CICS', position: 'BSCS Student (Capstone)', joined: '2024-08-15' },
  { key: 'st3', email: 'plim@zppsu.edu.ph',     password: 'fac123', name: 'Patricia Lim',   role: 'faculty', dept: 'CICS', position: 'BSCS Student (Capstone)', joined: '2024-08-15' },
];

const dept = {};
const user = {};
const meeting = {};
const minutesId = {};
const transcriptId = {};
const taskId = {};

// ---------------------------------------------------------------------------
async function loadDepartments() {
  const { data, error } = await db.from('departments').select('id, short');
  if (error) throw error;
  if (!data.length) {
    throw new Error(
      'No departments found. Apply the migrations first:\n' +
        '  node --env-file=.env.local scripts/db-push.mjs',
    );
  }
  data.forEach((d) => (dept[d.short] = d.id));
  console.log(`departments: ${data.length}`);
}

async function findExistingUser(email) {
  // listUsers has no email filter, so page until we find it. 14 accounts fits
  // comfortably in one page; the loop is here for safety.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function seedUsers() {
  for (const u of USERS) {
    const metadata = {
      name: u.name,
      role: u.role,
      department_id: u.dept, // the handle_new_user trigger resolves short codes
      position: u.position,
      active: true,
    };

    let account = await findExistingUser(u.email);

    if (account) {
      // Keep the password and metadata in sync with this file on re-runs.
      const { data, error } = await db.auth.admin.updateUserById(account.id, {
        password: u.password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error) throw new Error(`update ${u.email}: ${error.message}`);
      account = data.user;
      console.log(`  reuse  ${u.email}`);
    } else {
      const { data, error } = await db.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error) throw new Error(`create ${u.email}: ${error.message}`);
      account = data.user;
      console.log(`  create ${u.email}`);
    }

    user[u.key] = account.id;

    // The trigger fires on INSERT only, so an existing profile needs the same
    // values written explicitly.
    const { error: pErr } = await db.from('profiles').upsert(
      {
        id: account.id,
        name: u.name,
        email: u.email,
        role: u.role,
        department_id: dept[u.dept],
        position: u.position,
        active: true,
        joined_at: u.joined,
      },
      { onConflict: 'id' },
    );
    if (pErr) throw new Error(`profile ${u.email}: ${pErr.message}`);
  }

  // Department heads, now that the profiles exist.
  const heads = [
    ['CICS', user.head],
    ['CET', user.h2],
    ['ICT', user.admin],
  ];
  for (const [short, id] of heads) {
    const { error } = await db.from('departments').update({ head_id: id }).eq('short', short);
    if (error) throw error;
  }
  console.log(`profiles: ${USERS.length}, department heads: ${heads.length}`);
}

// ---------------------------------------------------------------------------
function meetingRows() {
  return [
    {
      key: 'm1',
      title: 'CICS Faculty Senate Monthly Sync',
      starts_at: at('2026-07-15', '09:00'),
      duration_min: 90,
      venue: 'Room 402 / Hybrid',
      department_id: dept.CICS,
      chair_id: user.head,
      secretary_id: user.secretary,
      agenda: ['Curriculum updates Q3', 'IT Infrastructure budget', 'Faculty loading Q3', 'CICS Accreditation prep'],
      status: 'transcribed',
      ai_processed: true,
      language: 'en-US',
      meeting_type: 'regular',
      participants: ['head', 'secretary', 'faculty', 'f2', 'f3', 'f4'],
    },
    {
      key: 'm2',
      title: 'IT Infrastructure Budget Planning',
      starts_at: at('2026-07-10', '14:00'),
      duration_min: 60,
      venue: 'Conference Room A',
      department_id: dept.CICS,
      chair_id: user.head,
      secretary_id: user.secretary,
      agenda: ['Lab 3 networking upgrade', 'Procurement timeline', 'Vendor evaluation'],
      status: 'pending_approval',
      ai_processed: true,
      language: 'en-US',
      meeting_type: 'regular',
      participants: ['head', 'secretary', 'f2'],
    },
    {
      key: 'm3',
      title: 'Curriculum Review Q3',
      starts_at: at('2026-07-12', '13:00'),
      duration_min: 120,
      venue: 'CICS Boardroom',
      department_id: dept.CICS,
      chair_id: user.head,
      secretary_id: user.secretary,
      agenda: ['Syllabus alignment with CHED CMO', 'Outcome-based education review'],
      status: 'approved',
      ai_processed: true,
      language: 'en-US',
      meeting_type: 'regular',
      participants: ['head', 'secretary', 'faculty', 'f4'],
    },
    {
      key: 'm4',
      title: 'Student Council Grievance Hearing',
      starts_at: at('2026-07-05', '15:00'),
      duration_min: 75,
      venue: 'Dean’s Office',
      department_id: dept.CICS,
      chair_id: user.head,
      secretary_id: user.secretary,
      agenda: ['Hearing of complaint', 'Resolution drafting'],
      status: 'archived',
      ai_processed: false,
      language: 'tl-PH',
      meeting_type: 'regular',
      participants: ['head', 'secretary', 'faculty'],
    },
    {
      key: 'm5',
      title: 'CET Strategic Planning 2026-2028',
      starts_at: at('2026-07-20', '08:30'),
      duration_min: 180,
      venue: 'University Auditorium',
      department_id: dept.CET,
      chair_id: user.h2,
      secretary_id: user.s2,
      agenda: ['Vision recalibration', 'Faculty development plan'],
      status: 'scheduled',
      ai_processed: false,
      language: 'en-US',
      meeting_type: 'regular',
      participants: ['h2', 's2', 'f5'],
    },
    {
      key: 'm6',
      title: 'University-wide Accreditation Briefing',
      starts_at: at('2026-07-22', '10:00'),
      duration_min: 90,
      venue: 'Online (Zoom)',
      department_id: dept.OAA,
      chair_id: user.admin,
      secretary_id: user.secretary,
      agenda: ['Documentation gaps', 'Mock evaluation schedule'],
      status: 'scheduled',
      ai_processed: false,
      language: 'en-US',
      meeting_type: 'regular',
      participants: ['admin', 'head', 'h2', 'secretary'],
    },
    {
      key: 'cap1',
      title: 'Capstone Title Proposal Defense - Mendoza et al.',
      starts_at: at('2026-07-08', '10:00'),
      duration_min: 120,
      venue: 'CICS Defense Room 1',
      department_id: dept.CICS,
      chair_id: user.head,
      secretary_id: user.secretary,
      agenda: ['Project background', 'Statement of the problem', 'Proposed methodology', 'Q&A'],
      status: 'approved',
      ai_processed: true,
      language: 'en-US',
      meeting_type: 'capstone',
      sub_type: 'Title Proposal',
      project_title: 'SmartMin AI: Local-First Institutional Governance Platform for ZPPSU',
      chairperson_id: user.head,
      panel_member_ids: [user.f2, user.f4],
      adviser_id: user.faculty,
      participants: ['head', 'secretary', 'f2', 'f4', 'faculty', 'st1', 'st2', 'st3'],
    },
    {
      key: 'cap2',
      title: 'Capstone Final Presentation - Mendoza et al.',
      starts_at: at('2026-08-12', '13:30'),
      duration_min: 150,
      venue: 'CICS Auditorium',
      department_id: dept.CICS,
      chair_id: user.head,
      secretary_id: user.secretary,
      agenda: ['Introduction', 'System demonstration', 'Results & evaluation', 'Panel Q&A'],
      status: 'scheduled',
      ai_processed: false,
      language: 'en-US',
      meeting_type: 'capstone',
      sub_type: 'Final Presentation',
      project_title: 'SmartMin AI: Local-First Institutional Governance Platform for ZPPSU',
      chairperson_id: user.head,
      panel_member_ids: [user.f2, user.f4],
      adviser_id: user.faculty,
      participants: ['head', 'secretary', 'f2', 'f4', 'faculty', 'st1', 'st2', 'st3'],
    },
    {
      key: 'cap3',
      title: 'Capstone Mock Defense - Aquino & Lim',
      starts_at: at('2026-07-25', '14:00'),
      duration_min: 90,
      venue: 'CICS Defense Room 2',
      department_id: dept.CICS,
      chair_id: user.head,
      secretary_id: user.secretary,
      agenda: ['Methodology rehearsal', 'System walkthrough', 'Panel feedback'],
      status: 'pending_approval',
      ai_processed: true,
      language: 'en-US',
      meeting_type: 'capstone',
      sub_type: 'Mock Defense',
      project_title: 'AgriTrack: IoT-Based Crop Monitoring for Mindanao Smallholders',
      chairperson_id: user.head,
      panel_member_ids: [user.f3, user.f4],
      adviser_id: user.f2,
      participants: ['head', 'secretary', 'f3', 'f4', 'st2', 'st3'],
    },
    {
      key: 'res1',
      title: 'Research Progress: Local LLM Benchmarking Study',
      starts_at: at('2026-07-18', '15:00'),
      duration_min: 60,
      venue: 'CICS Research Lab',
      department_id: dept.CICS,
      chair_id: user.head,
      secretary_id: user.secretary,
      agenda: ['Dataset coverage', 'Preliminary results', 'Next steps'],
      status: 'scheduled',
      ai_processed: false,
      language: 'en-US',
      meeting_type: 'research',
      sub_type: 'Progress',
      project_title: 'Local LLM Benchmarking Study',
      adviser_id: user.f4,
      participants: ['head', 'secretary', 'f4'],
    },
  ];
}

async function seedMeetings() {
  for (const row of meetingRows()) {
    const { key, participants, ...fields } = row;

    // Title + start time is the natural key for a re-run.
    const { data: existing } = await db
      .from('meetings')
      .select('id')
      .eq('title', fields.title)
      .maybeSingle();

    let id;
    if (existing) {
      const { data, error } = await db
        .from('meetings')
        .update(fields)
        .eq('id', existing.id)
        .select('id')
        .single();
      if (error) throw new Error(`meeting ${key}: ${error.message}`);
      id = data.id;
    } else {
      const { data, error } = await db.from('meetings').insert(fields).select('id').single();
      if (error) throw new Error(`meeting ${key}: ${error.message}`);
      id = data.id;
    }
    meeting[key] = id;

    const rows = participants.map((p) => ({ meeting_id: id, user_id: user[p] }));
    const { error: pErr } = await db
      .from('meeting_participants')
      .upsert(rows, { onConflict: 'meeting_id,user_id' });
    if (pErr) throw new Error(`participants ${key}: ${pErr.message}`);
  }
  console.log(`meetings: ${Object.keys(meeting).length}`);
}

// ---------------------------------------------------------------------------
function transcriptRows() {
  return [
    {
      key: 't1',
      meeting_id: meeting.m1,
      language: 'en-US',
      confidence: 0.98,
      ai_model: 'web-speech',
      segments: [
        { speakerId: user.head,      speaker: 'Engr. Ricardo Gomez',        t: 0,   text: 'Good morning, colleagues. Let us call this Faculty Senate Monthly Sync to order. We have a quorum with eighteen out of twenty members present.' },
        { speakerId: user.secretary, speaker: 'Sarah Torres',               t: 32,  text: 'Thank you, sir. The minutes of the previous meeting on June 20 have been circulated. May I move for their approval?' },
        { speakerId: user.f2,        speaker: 'Dr. Maria Santos',           t: 58,  text: 'I second the motion. The minutes were thoroughly reviewed and reflect the discussion accurately.' },
        { speakerId: user.head,      speaker: 'Engr. Ricardo Gomez',        t: 75,  text: 'Approved without corrections. Moving on, the first agenda item is the curriculum review for the incoming freshmen. Dr. Villanueva, the floor is yours.' },
        { speakerId: user.f4,        speaker: 'Prof. Antonette Villanueva', t: 95,  text: 'Thank you. We need to finalize the curriculum updates by next week. The board is expecting our compliance report aligned with the new CHED CMO. I propose we set a deadline for August 7 for the syllabus collation.' },
        { speakerId: user.head,      speaker: 'Engr. Ricardo Gomez',        t: 140, text: 'I agree. I’ll ask Prof. Dela Cruz to compile the syllabus drafts. Juan, can you have that ready by Thursday next week?' },
        { speakerId: user.faculty,   speaker: 'Prof. Juan Dela Cruz',       t: 170, text: 'Yes, I will coordinate with the other instructors and consolidate the drafts by Thursday.' },
        { speakerId: user.head,      speaker: 'Engr. Ricardo Gomez',        t: 195, text: 'Excellent. Next, the IT Infrastructure budget. Dr. Santos, please present.' },
        { speakerId: user.f2,        speaker: 'Dr. Maria Santos',           t: 215, text: 'We are proposing a budget of one point two million pesos for laboratory upgrades. Priority is the replacement of obsolete networking equipment in Lab 3. The Finance committee should endorse this to the VP for Academic Affairs by next week.' },
        { speakerId: user.head,      speaker: 'Engr. Ricardo Gomez',        t: 270, text: 'Understood. I will draft the endorsement letter for the IT budget by July 22. Sarah, please record this as an action item.' },
        { speakerId: user.secretary, speaker: 'Sarah Torres',               t: 300, text: 'Noted, sir. I will tag it in the task board.' },
        { speakerId: user.head,      speaker: 'Engr. Ricardo Gomez',        t: 315, text: 'Lastly, for faculty loading Q3, Dr. Reyes will submit the final schedule conflict report by July 20. With no further business, this meeting is adjourned at 11:30 AM.' },
      ],
      summary:
        'The CICS Faculty Senate approved the previous minutes, agreed on a curriculum collation deadline of August 7 aligned with the new CHED CMO, endorsed a PHP 1.2M IT infrastructure budget prioritizing Lab 3 networking, and tasked Prof. Dela Cruz to consolidate syllabus drafts by next Thursday, Engr. Gomez to draft the IT budget endorsement letter by July 22, and Dr. Reyes to submit the schedule conflict report by July 20.',
      comments: [],
    },
    {
      key: 't2',
      meeting_id: meeting.m2,
      language: 'en-US',
      confidence: 0.97,
      ai_model: 'web-speech',
      segments: [
        { speakerId: user.head,      speaker: 'Engr. Ricardo Gomez', t: 0,  text: 'Today’s session focuses on the IT infrastructure budget. We have line items for Lab 3 networking, server upgrades, and software licensing.' },
        { speakerId: user.f2,        speaker: 'Dr. Maria Santos',    t: 25, text: 'The networking equipment in Lab 3 is over seven years old and a security risk. I recommend prioritizing its replacement.' },
        { speakerId: user.secretary, speaker: 'Sarah Torres',        t: 60, text: 'Noted. Will the procurement go through the standard bidding?' },
        { speakerId: user.head,      speaker: 'Engr. Ricardo Gomez', t: 80, text: 'Yes. Sarah, please coordinate with the Procurement office and draft the request by July 18.' },
      ],
      summary:
        'Approved priority replacement of Lab 3 networking due to age and security risk; Sarah to coordinate with Procurement and draft the request by July 18; standard bidding will apply.',
      comments: [],
    },
    {
      key: 't3',
      meeting_id: meeting.m3,
      language: 'en-US',
      confidence: 0.96,
      ai_model: 'web-speech',
      segments: [
        { speakerId: user.head,    speaker: 'Engr. Ricardo Gomez',        t: 0,  text: 'We need to ensure every CICS program aligns with the new CHED CMO. The deadline for accreditation prep is August 30.' },
        { speakerId: user.f4,      speaker: 'Prof. Antonette Villanueva', t: 30, text: 'The outcome-based education matrix needs an update. I can lead a workshop next week.' },
        { speakerId: user.faculty, speaker: 'Prof. Juan Dela Cruz',       t: 70, text: 'I support that. We can use the workshop output as the basis for syllabus revision.' },
      ],
      summary:
        'CICS programs to be aligned with new CHED CMO before August 30; Prof. Villanueva to lead an OBE workshop next week with output feeding directly into syllabus revisions.',
      comments: [],
    },
    {
      key: 'tcap1',
      meeting_id: meeting.cap1,
      language: 'en-US',
      confidence: 0.97,
      ai_model: 'web-speech',
      segments: [
        { speakerId: user.head, speaker: 'Engr. Ricardo Gomez (Chair)',   t: 0,   text: 'We call this Title Proposal Defense to order. Panel members present: Dr. Santos, Prof. Villanueva. Adviser: Prof. Dela Cruz. Proponents please introduce yourselves.' },
        { speakerId: user.st1,  speaker: 'Karla Mendoza',                  t: 28,  text: 'Good morning panel. Our proposed title is SmartMin AI: Local-First Institutional Governance Platform for ZPPSU. The system aims to automate meeting minutes through bilingual transcription and AI summarization, while keeping data on-premises.' },
        { speakerId: user.st2,  speaker: 'Joshua Aquino',                  t: 75,  text: 'Our statement of the problem revolves around how secretaries in ZPPSU spend an average of six hours per meeting on manual minute taking. We aim to reduce this by 80 percent.' },
        { speakerId: user.f2,   speaker: 'Dr. Maria Santos',               t: 140, text: 'How will you handle Tagalog speech recognition? Whisper has limited Filipino support.' },
        { speakerId: user.st3,  speaker: 'Patricia Lim',                   t: 168, text: 'We will use Web Speech API with the tl-PH locale plus a custom dictionary-based post-processor. For low-resource fallback, we provide an editable transcript pane.' },
        { speakerId: user.f4,   speaker: 'Prof. Antonette Villanueva',     t: 220, text: 'I recommend you tighten the scope. Mock the offline auto-upload feature first, then expand.' },
        { speakerId: user.head, speaker: 'Engr. Ricardo Gomez (Chair)',   t: 280, text: 'Panel decision: title approved with the following minor revisions - clarify Local-First scope and add evaluation metrics section. Proponents to submit revised proposal by July 22.' },
      ],
      summary:
        'Panel unanimously approved the capstone title "SmartMin AI: Local-First Institutional Governance Platform for ZPPSU" with minor revisions. Proponents to clarify Local-First scope, add evaluation metrics, and submit the revised proposal by July 22. Adviser supports phased delivery starting with offline auto-upload.',
      comments: [
        { id: 'c1', ts: msAgo(5), userId: null, name: 'Dr. Maria Santos',      text: 'Strong proposal overall. Please attach references for the offline-first claim.' },
        { id: 'c2', ts: msAgo(3), userId: null, name: 'Prof. Juan Dela Cruz',  text: 'As adviser, I will work with the team on the evaluation metrics section before July 22.' },
      ],
      commentAuthors: ['f2', 'faculty'],
    },
    {
      key: 'tcap3',
      meeting_id: meeting.cap3,
      language: 'en-US',
      confidence: 0.96,
      ai_model: 'web-speech',
      segments: [
        { speakerId: user.head, speaker: 'Engr. Ricardo Gomez (Chair)', t: 0,   text: 'This is a mock defense session. The panel will simulate questions to prepare the proponents for their final defense. Begin presentation.' },
        { speakerId: user.st2,  speaker: 'Joshua Aquino',                t: 22,  text: 'AgriTrack is an IoT-based crop monitoring platform tailored to smallholder farms in Mindanao. It uses solar-powered ESP32 nodes and an LPWAN gateway.' },
        { speakerId: user.f3,   speaker: 'Prof. Mark Reyes',             t: 95,  text: 'How do you ensure connectivity reliability in remote rural areas?' },
        { speakerId: user.st3,  speaker: 'Patricia Lim',                 t: 120, text: 'We use LoRaWAN with store-and-forward at the edge. If the gateway loses uplink, data buffers up to seven days.' },
        { speakerId: user.f4,   speaker: 'Prof. Antonette Villanueva',   t: 180, text: 'Action item: revise your evaluation chapter to include the LoRaWAN packet loss tests we discussed last week. Deadline: before the final defense.' },
        { speakerId: user.head, speaker: 'Engr. Ricardo Gomez (Chair)', t: 240, text: 'Overall the team is well prepared. Mock defense is endorsed for final scheduling pending the evaluation chapter revision.' },
      ],
      summary:
        'AgriTrack mock defense was successful. Panel endorsed proponents for final scheduling, subject to a revision of the evaluation chapter to include LoRaWAN packet-loss test data. Connectivity reliability concerns addressed via LoRaWAN store-and-forward design.',
      comments: [],
    },
  ];
}

async function seedTranscripts() {
  for (const row of transcriptRows()) {
    const { key, commentAuthors, ...fields } = row;

    // Fill in real author ids for the seeded comments.
    if (commentAuthors) {
      fields.comments = fields.comments.map((c, i) => ({
        ...c,
        userId: user[commentAuthors[i]] ?? null,
      }));
    }

    const { data: existing } = await db
      .from('transcripts')
      .select('id')
      .eq('meeting_id', fields.meeting_id)
      .maybeSingle();

    let id;
    if (existing) {
      const { data, error } = await db
        .from('transcripts')
        .update(fields)
        .eq('id', existing.id)
        .select('id')
        .single();
      if (error) throw new Error(`transcript ${key}: ${error.message}`);
      id = data.id;
    } else {
      const { data, error } = await db.from('transcripts').insert(fields).select('id').single();
      if (error) throw new Error(`transcript ${key}: ${error.message}`);
      id = data.id;
    }
    transcriptId[key] = id;
  }
  console.log(`transcripts: ${Object.keys(transcriptId).length}`);
}

// ---------------------------------------------------------------------------
function minutesRows() {
  return [
    {
      key: 'min1',
      meeting_id: meeting.m1,
      status: 'pending_approval',
      document_title: 'Minutes of the CICS Faculty Senate Monthly Sync',
      call_to_order:
        'The meeting was called to order at 09:05 AM by Engr. Ricardo Gomez, College Dean of CICS. A quorum was established with 18 of 20 regular faculty members present.',
      previous_minutes:
        'The minutes of the previous meeting held on June 20, 2026 were reviewed. A motion to approve was raised by Prof. Maria Santos and seconded by Dr. Liza Reyes. Approved without corrections.',
      agenda_items: [
        { title: 'CICS Accreditation Prep', notes: 'Dr. Villanueva emphasized the need for updated syllabi matching the new CHED CMO. Target completion for document collation set for August 7. Mock evaluation scheduled mid-August.' },
        { title: 'IT Infrastructure Budget', notes: 'Proposed budget of PHP 1,200,000 for laboratory upgrades was presented. Priority given to replacing obsolete networking equipment in Lab 3. Finance committee to review and endorse to the VP for Academic Affairs.' },
        { title: 'Faculty Loading Q3', notes: 'Preliminary teaching loads distributed for review. Concerns raised regarding overlapping schedules for core major subjects. Adjustments to be finalized in coordination with the Registrar’s office.' },
      ],
      adjournment:
        'There being no other matters, the meeting was adjourned at 11:30 AM. Next regular meeting set for August 15, 2026.',
      signatures: [],
      comments: [],
      amendments: [],
    },
    {
      key: 'min2',
      meeting_id: meeting.m2,
      status: 'pending_approval',
      document_title: 'Minutes of the IT Infrastructure Budget Planning',
      call_to_order: 'The meeting was called to order at 02:00 PM by Engr. Ricardo Gomez.',
      previous_minutes: 'Not applicable - special session.',
      agenda_items: [
        { title: 'Lab 3 Networking Replacement', notes: 'Approved as priority; over seven years old; security risk identified.' },
        { title: 'Procurement Path', notes: 'Standard bidding to be followed; Procurement office to be coordinated with by July 18.' },
      ],
      adjournment: 'Adjourned at 03:00 PM.',
      signatures: [],
      comments: [],
      amendments: [],
    },
    {
      key: 'min3',
      meeting_id: meeting.m3,
      status: 'approved',
      document_title: 'Minutes of the Curriculum Review Q3',
      call_to_order: 'The meeting was called to order at 01:00 PM by Engr. Ricardo Gomez.',
      previous_minutes: 'Reviewed and approved.',
      agenda_items: [
        { title: 'CHED CMO Alignment', notes: 'All programs to be aligned by August 30, 2026.' },
        { title: 'OBE Workshop', notes: 'Prof. Villanueva to lead workshop next week; output to feed into syllabus revision.' },
      ],
      adjournment: 'Adjourned at 03:00 PM.',
      signatures: [
        { userId: user.secretary, name: 'Sarah Torres',        role: 'Faculty Secretary', signedAt: msAgo(72), dataUrl: '' },
        { userId: user.head,      name: 'Engr. Ricardo Gomez', role: 'College Dean',      signedAt: msAgo(48), dataUrl: '' },
      ],
      comments: [],
      amendments: [],
      locked_at: hoursAgo(48),
      locked_by: user.head,
    },
    {
      key: 'mincap1',
      meeting_id: meeting.cap1,
      status: 'approved',
      document_title: 'Minutes of the Capstone Title Proposal Defense',
      call_to_order:
        'The Title Proposal Defense was called to order at 10:00 AM by Engr. Ricardo Gomez, College Dean of CICS, with panel members Dr. Maria Santos and Prof. Antonette Villanueva, and adviser Prof. Juan Dela Cruz. All three (3) proponents were present.',
      previous_minutes: 'Not applicable - first defense session.',
      agenda_items: [
        { title: 'Project Background', notes: 'Proponents introduced the SmartMin AI concept, emphasizing the local-first architecture and bilingual AI features for institutional governance.' },
        { title: 'Statement of the Problem', notes: 'Documented that ZPPSU secretaries spend an average of 6 hours per meeting on manual minute taking. Target reduction of 80 percent justified.' },
        { title: 'Proposed Methodology', notes: 'Web Speech API + custom Tagalog dictionary post-processor, MediaRecorder + IndexedDB for offline capture, deterministic templates for fallback summarization.' },
        { title: 'Panel Q&A', notes: 'Dr. Santos questioned Tagalog accuracy; addressed with editable transcript pane. Prof. Villanueva recommended phased delivery, starting with offline auto-upload. Adviser supports the approach.' },
      ],
      adjournment:
        'Defense concluded at 12:00 PM with the title approved subject to minor revisions. Revised proposal due July 22, 2026.',
      signatures: [
        { userId: user.secretary, name: 'Sarah Torres',        role: 'Faculty Secretary',          signedAt: msAgo(48), dataUrl: '' },
        { userId: user.head,      name: 'Engr. Ricardo Gomez', role: 'College Dean / Chairperson', signedAt: msAgo(24), dataUrl: '' },
      ],
      comments: [],
      amendments: [],
      locked_at: hoursAgo(24),
      locked_by: user.head,
    },
    {
      key: 'mincap3',
      meeting_id: meeting.cap3,
      status: 'pending_approval',
      document_title: 'Minutes of the Capstone Mock Defense',
      call_to_order:
        'Mock defense session called to order at 02:00 PM by the Chair. Two (2) proponents present, with panel members Prof. Mark Reyes and Prof. Antonette Villanueva, and adviser Dr. Maria Santos.',
      previous_minutes: 'Not applicable - mock session.',
      agenda_items: [
        { title: 'Methodology Rehearsal', notes: 'AgriTrack platform overview: solar-powered ESP32 nodes with LoRaWAN gateway for crop monitoring.' },
        { title: 'System Walkthrough', notes: 'Edge buffering of up to 7 days addresses rural connectivity gaps; live data feed demonstrated.' },
        { title: 'Panel Feedback', notes: 'Panel endorsed proponents for final scheduling, subject to a revision of the evaluation chapter to include LoRaWAN packet-loss tests.' },
      ],
      adjournment: 'Adjourned at 03:30 PM. Final defense scheduling pending evaluation chapter revision.',
      signatures: [
        { userId: user.secretary, name: 'Sarah Torres', role: 'Faculty Secretary', signedAt: msAgo(0.5), dataUrl: '' },
      ],
      comments: [],
      amendments: [],
    },
  ];
}

async function seedMinutes() {
  for (const row of minutesRows()) {
    const { key, ...fields } = row;
    const { data, error } = await db
      .from('minutes')
      .upsert(fields, { onConflict: 'meeting_id' })
      .select('id')
      .single();
    if (error) throw new Error(`minutes ${key}: ${error.message}`);
    minutesId[key] = data.id;
  }
  console.log(`minutes: ${Object.keys(minutesId).length}`);
}

// ---------------------------------------------------------------------------
function taskRows() {
  return [
    { key: 'a1', title: 'Update all course syllabi to align with new CMO',           description: 'Coordinate with CICS faculty for collation of updated syllabi following CHED Memo Order.', meeting_id: meeting.m1,   department_id: dept.CICS, assignee_id: user.f4,        delegated_by: user.head, priority: 'high',   deadline: '2026-08-07', status: 'in_progress', ai_extracted: true },
    { key: 'a2', title: 'Draft endorsement letter for IT Infrastructure budget',     description: 'Endorse PHP 1.2M proposal to VP for Academic Affairs.',                                  meeting_id: meeting.m1,   department_id: dept.CICS, assignee_id: user.head,      delegated_by: user.head, priority: 'medium', deadline: '2026-07-22', status: 'pending',     ai_extracted: true },
    { key: 'a3', title: 'Submit final schedule conflict report',                     description: 'Compile and finalize Q3 schedule conflicts for the Registrar.',                          meeting_id: meeting.m1,   department_id: dept.CICS, assignee_id: user.f2,        delegated_by: user.head, priority: 'high',   deadline: '2026-07-20', status: 'in_progress', ai_extracted: true },
    { key: 'a4', title: 'Coordinate Lab 3 procurement with Procurement Office',      description: 'Draft procurement request following standard bidding.',                                 meeting_id: meeting.m2,   department_id: dept.CICS, assignee_id: user.secretary, delegated_by: user.head, priority: 'medium', deadline: '2026-07-18', status: 'pending',     ai_extracted: true },
    { key: 'a5', title: 'Compile syllabus drafts from instructors',                  description: 'Consolidate the syllabus drafts from all CICS instructors.',                            meeting_id: meeting.m1,   department_id: dept.CICS, assignee_id: user.faculty,   delegated_by: user.head, priority: 'high',   deadline: '2026-07-23', status: 'pending',     ai_extracted: true },
    { key: 'a6', title: 'Review draft minutes for CICS Senate',                      description: 'Final pass review before signature routing.',                                          meeting_id: meeting.m1,   department_id: dept.CICS, assignee_id: user.secretary, delegated_by: user.head, priority: 'medium', deadline: '2026-07-17', status: 'done',        ai_extracted: false },
    { key: 'a7', title: 'Lead OBE workshop for CICS faculty',                        description: 'Prepare and conduct the OBE workshop.',                                                meeting_id: meeting.m3,   department_id: dept.CICS, assignee_id: user.f4,        delegated_by: user.head, priority: 'medium', deadline: '2026-07-25', status: 'done',        ai_extracted: true },
    { key: 'capa1', title: 'Submit revised Title Proposal with evaluation metrics',  description: 'Clarify Local-First scope and add evaluation metrics section per panel feedback.',       meeting_id: meeting.cap1, department_id: dept.CICS, assignee_id: user.st1,       delegated_by: user.head, priority: 'high',   deadline: '2026-07-22', status: 'in_progress', ai_extracted: true },
  ];
}

async function seedTasks() {
  for (const row of taskRows()) {
    const { key, ...fields } = row;
    const { data: existing } = await db
      .from('tasks')
      .select('id')
      .eq('title', fields.title)
      .maybeSingle();

    let id;
    if (existing) {
      const { data, error } = await db
        .from('tasks')
        .update(fields)
        .eq('id', existing.id)
        .select('id')
        .single();
      if (error) throw new Error(`task ${key}: ${error.message}`);
      id = data.id;
    } else {
      const { data, error } = await db.from('tasks').insert(fields).select('id').single();
      if (error) throw new Error(`task ${key}: ${error.message}`);
      id = data.id;
    }
    taskId[key] = id;
  }
  console.log(`tasks: ${Object.keys(taskId).length}`);
}

// ---------------------------------------------------------------------------
async function seedPersonalMeetings() {
  const rows = [
    {
      user_id: user.faculty,
      meeting_date: '2026-07-09',
      meeting_time: '15:00',
      type: 'Adviser-Advisee',
      title: 'Capstone Adviser Sync with Mendoza Group',
      attendees: 'Karla Mendoza, Joshua Aquino, Patricia Lim',
      notes:
        'Reviewed feedback from Title Proposal panel. Agreed on revised methodology section; team to send updated draft by July 18.',
    },
    {
      user_id: user.faculty,
      meeting_date: '2026-07-14',
      meeting_time: '10:30',
      type: 'Faculty Consultation',
      title: 'Office Hours - Curriculum Discussion',
      attendees: 'Prof. Mark Reyes',
      notes: 'Discussed unit alignment for the upcoming OBE workshop deliverables.',
    },
  ];

  for (const row of rows) {
    const { data: existing } = await db
      .from('personal_meetings')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('title', row.title)
      .maybeSingle();
    if (existing) {
      const { error } = await db.from('personal_meetings').update(row).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await db.from('personal_meetings').insert(row);
      if (error) throw error;
    }
  }
  console.log(`personal meetings: ${rows.length}`);
}

async function seedNotificationsAndAudit() {
  const { count } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true });

  if (!count) {
    const { error } = await db.from('notifications').insert([
      { user_id: user.secretary, type: 'ai',       title: 'Transcription complete',     body: 'Capstone Title Proposal Defense transcript is ready for review.', read: false },
      { user_id: user.head,      type: 'approval', title: 'Minutes awaiting signature', body: 'Capstone Mock Defense minutes pending your signature.',           read: false },
      { user_id: user.faculty,   type: 'task',     title: 'New task assigned',          body: 'You have been delegated: Compile syllabus drafts.',               read: true },
    ]);
    if (error) throw error;
    console.log('notifications: 3');
  } else {
    console.log(`notifications: ${count} already present`);
  }

  const { count: auditCount } = await db
    .from('audit_log')
    .select('id', { count: 'exact', head: true });

  if (!auditCount) {
    const { error } = await db.from('audit_log').insert([
      { user_id: user.admin,     user_name: 'Dr. Elena Dominguez', role: 'admin',     action: 'transcription_completed', detail: 'Capstone Title Proposal - Mendoza et al.',                       created_at: hoursAgo(0.7) },
      { user_id: user.head,      user_name: 'Engr. Ricardo Gomez', role: 'head',      action: 'minutes_approved',        detail: 'Curriculum Review Q3',                                           created_at: hoursAgo(25) },
      { user_id: user.head,      user_name: 'Engr. Ricardo Gomez', role: 'head',      action: 'minutes_locked',          detail: 'Capstone Title Proposal Defense locked after Head approval',      created_at: hoursAgo(24) },
      { user_id: user.admin,     user_name: 'Dr. Elena Dominguez', role: 'admin',     action: 'role_assigned',           detail: 'Prof. Mark Reyes - Faculty',                                     created_at: hoursAgo(70) },
      { user_id: user.admin,     user_name: 'Dr. Elena Dominguez', role: 'admin',     action: 'ai_task_extracted',       detail: 'Capstone action items extracted',                                created_at: hoursAgo(96) },
      { user_id: user.secretary, user_name: 'Sarah Torres',        role: 'secretary', action: 'login',                   detail: 'Secretary login from campus network',                            created_at: hoursAgo(120) },
    ]);
    if (error) throw error;
    console.log('audit entries: 6');
  } else {
    console.log(`audit entries: ${auditCount} already present`);
  }
}

// ---------------------------------------------------------------------------
async function reset() {
  console.log('resetting demo content (accounts are kept)...');
  // Children first; meetings cascade to participants/transcripts/minutes.
  for (const table of ['audit_log', 'notifications', 'personal_meetings', 'tasks', 'audio_recordings']) {
    const { error } = await db.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(`reset ${table}: ${error.message}`);
  }
  const { error } = await db
    .from('meetings')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw new Error(`reset meetings: ${error.message}`);
}

async function main() {
  await loadDepartments();
  if (RESET) await reset();
  await seedUsers();
  await seedMeetings();
  await seedTranscripts();
  await seedMinutes();
  await seedTasks();
  await seedPersonalMeetings();
  await seedNotificationsAndAudit();

  console.log('\nDemo data ready. Sign in with:');
  console.log('  admin@zppsu.edu.ph     / admin123');
  console.log('  president@zppsu.edu.ph / head123');
  console.log('  secretary@zppsu.edu.ph / sec123');
  console.log('  faculty@zppsu.edu.ph   / fac123');
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});
