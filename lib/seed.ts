// SmartMin demo seed data — faithful TS port of assets/js/seed.js.
// Runs once on the client (guarded by the `seeded` flag).

import { LS_KEYS, write } from './store';
import type {
  AuditEntry,
  Department,
  Meeting,
  Minutes,
  Notification,
  PersonalMeeting,
  Task,
  Taxonomy,
  Transcript,
  User,
} from './types';

const DAY = 1000 * 60 * 60 * 24;
const HOUR = 1000 * 60 * 60;
const MIN = 1000 * 60;

const departments: Department[] = [
  { id: 'dept_cics', name: 'College of Information & Computing Sciences', short: 'CICS', type: 'college', headId: 'u_head', officeLocation: 'Bldg A, 4F' },
  { id: 'dept_cet', name: 'College of Engineering & Technology', short: 'CET', type: 'college', headId: 'u_h2', officeLocation: 'Bldg B, 2F' },
  { id: 'dept_cba', name: 'College of Business Administration', short: 'CBA', type: 'college', headId: '', officeLocation: 'Bldg C, 3F' },
  { id: 'dept_cte', name: 'College of Teacher Education', short: 'CTE', type: 'college', headId: '', officeLocation: 'Bldg D, 1F' },
  { id: 'dept_coe', name: 'College of Education', short: 'COE', type: 'college', headId: '', officeLocation: 'Bldg D, 2F' },
  { id: 'dept_ict', name: 'ICT Management Office', short: 'ICT', type: 'office', headId: 'u_admin', officeLocation: 'Admin Bldg, GF' },
  { id: 'dept_acad', name: 'Office of Academic Affairs', short: 'OAA', type: 'office', headId: '', officeLocation: 'Admin Bldg, 2F' },
  { id: 'dept_pres', name: 'Office of the University President', short: 'OUP', type: 'office', headId: '', officeLocation: 'Admin Bldg, 3F' },
];

const users: User[] = [
  { id: 'u_admin', name: 'Dr. Elena Dominguez', email: 'admin@zppsu.edu.ph', password: 'admin123', role: 'admin', departmentId: 'dept_ict', position: 'System Administrator', active: true, joinedAt: '2023-08-10', photoDataUrl: '' },
  { id: 'u_head', name: 'Engr. Ricardo Gomez', email: 'president@zppsu.edu.ph', password: 'head123', role: 'head', departmentId: 'dept_cics', position: 'College Dean (CICS)', active: true, joinedAt: '2022-06-01', photoDataUrl: '' },
  { id: 'u_secretary', name: 'Sarah Torres', email: 'secretary@zppsu.edu.ph', password: 'sec123', role: 'secretary', departmentId: 'dept_cics', position: 'Faculty Secretary (CICS)', active: true, joinedAt: '2024-01-15', photoDataUrl: '' },
  { id: 'u_faculty', name: 'Prof. Juan Dela Cruz', email: 'faculty@zppsu.edu.ph', password: 'fac123', role: 'faculty', departmentId: 'dept_cics', position: 'Associate Professor', active: true, joinedAt: '2023-09-01', photoDataUrl: '' },
  { id: 'u_f2', name: 'Dr. Maria Santos', email: 'msantos@zppsu.edu.ph', password: 'fac123', role: 'faculty', departmentId: 'dept_cics', position: 'Professor I', active: true, joinedAt: '2022-08-12', photoDataUrl: '' },
  { id: 'u_f3', name: 'Prof. Mark Reyes', email: 'mreyes@zppsu.edu.ph', password: 'fac123', role: 'faculty', departmentId: 'dept_cics', position: 'Instructor III', active: true, joinedAt: '2024-02-01', photoDataUrl: '' },
  { id: 'u_f4', name: 'Prof. Antonette Villanueva', email: 'avillanueva@zppsu.edu.ph', password: 'fac123', role: 'faculty', departmentId: 'dept_cics', position: 'Assistant Professor', active: true, joinedAt: '2023-03-20', photoDataUrl: '' },
  { id: 'u_f5', name: 'Engr. Liza Reyes', email: 'lreyes@zppsu.edu.ph', password: 'fac123', role: 'faculty', departmentId: 'dept_cet', position: 'Instructor II', active: true, joinedAt: '2024-08-01', photoDataUrl: '' },
  { id: 'u_h2', name: 'Dr. Antonio Mendoza', email: 'amendoza@zppsu.edu.ph', password: 'head123', role: 'head', departmentId: 'dept_cet', position: 'College Dean (CET)', active: true, joinedAt: '2021-06-01', photoDataUrl: '' },
  { id: 'u_s2', name: 'James Luna', email: 'jluna@zppsu.edu.ph', password: 'sec123', role: 'secretary', departmentId: 'dept_cet', position: 'Secretary (CET)', active: true, joinedAt: '2024-05-01', photoDataUrl: '' },
  { id: 'u_st1', name: 'Karla Mendoza', email: 'kmendoza@zppsu.edu.ph', password: 'fac123', role: 'faculty', departmentId: 'dept_cics', position: 'BSCS Student (Capstone)', active: true, joinedAt: '2024-08-15', photoDataUrl: '' },
  { id: 'u_st2', name: 'Joshua Aquino', email: 'jaquino@zppsu.edu.ph', password: 'fac123', role: 'faculty', departmentId: 'dept_cics', position: 'BSCS Student (Capstone)', active: true, joinedAt: '2024-08-15', photoDataUrl: '' },
  { id: 'u_st3', name: 'Patricia Lim', email: 'plim@zppsu.edu.ph', password: 'fac123', role: 'faculty', departmentId: 'dept_cics', position: 'BSCS Student (Capstone)', active: true, joinedAt: '2024-08-15', photoDataUrl: '' },
];

const meetings: Meeting[] = [
  { id: 'm_1', title: 'CICS Faculty Senate Monthly Sync', date: '2026-07-15T09:00', durationMin: 90, venue: 'Room 402 / Hybrid', departmentId: 'dept_cics', chairId: 'u_head', secretaryId: 'u_secretary', participantIds: ['u_head', 'u_secretary', 'u_faculty', 'u_f2', 'u_f3', 'u_f4'], agenda: ['Curriculum updates Q3', 'IT Infrastructure budget', 'Faculty loading Q3', 'CICS Accreditation prep'], status: 'transcribed', aiProcessed: true, language: 'en-US', transcriptId: 't_1', minutesId: 'min_1', meetingType: 'regular', subType: '', projectTitle: '', chairpersonId: '', panelMemberIds: [], adviserId: '' },
  { id: 'm_2', title: 'IT Infrastructure Budget Planning', date: '2026-07-10T14:00', durationMin: 60, venue: 'Conference Room A', departmentId: 'dept_cics', chairId: 'u_head', secretaryId: 'u_secretary', participantIds: ['u_head', 'u_secretary', 'u_f2'], agenda: ['Lab 3 networking upgrade', 'Procurement timeline', 'Vendor evaluation'], status: 'pending_approval', aiProcessed: true, language: 'en-US', transcriptId: 't_2', minutesId: 'min_2', meetingType: 'regular', subType: '', projectTitle: '', chairpersonId: '', panelMemberIds: [], adviserId: '' },
  { id: 'm_3', title: 'Curriculum Review Q3', date: '2026-07-12T13:00', durationMin: 120, venue: 'CICS Boardroom', departmentId: 'dept_cics', chairId: 'u_head', secretaryId: 'u_secretary', participantIds: ['u_head', 'u_secretary', 'u_faculty', 'u_f4'], agenda: ['Syllabus alignment with CHED CMO', 'Outcome-based education review'], status: 'approved', aiProcessed: true, language: 'en-US', transcriptId: 't_3', minutesId: 'min_3', meetingType: 'regular', subType: '', projectTitle: '', chairpersonId: '', panelMemberIds: [], adviserId: '' },
  { id: 'm_4', title: 'Student Council Grievance Hearing', date: '2026-07-05T15:00', durationMin: 75, venue: 'Dean’s Office', departmentId: 'dept_cics', chairId: 'u_head', secretaryId: 'u_secretary', participantIds: ['u_head', 'u_secretary', 'u_faculty'], agenda: ['Hearing of complaint', 'Resolution drafting'], status: 'archived', aiProcessed: false, language: 'tl-PH', meetingType: 'regular', subType: '', projectTitle: '', chairpersonId: '', panelMemberIds: [], adviserId: '' },
  { id: 'm_5', title: 'CET Strategic Planning 2026-2028', date: '2026-07-20T08:30', durationMin: 180, venue: 'University Auditorium', departmentId: 'dept_cet', chairId: 'u_h2', secretaryId: 'u_s2', participantIds: ['u_h2', 'u_s2', 'u_f5'], agenda: ['Vision recalibration', 'Faculty development plan'], status: 'scheduled', aiProcessed: false, language: 'en-US', meetingType: 'regular', subType: '', projectTitle: '', chairpersonId: '', panelMemberIds: [], adviserId: '' },
  { id: 'm_6', title: 'University-wide Accreditation Briefing', date: '2026-07-22T10:00', durationMin: 90, venue: 'Online (Zoom)', departmentId: 'dept_acad', chairId: 'u_admin', secretaryId: 'u_secretary', participantIds: ['u_admin', 'u_head', 'u_h2', 'u_secretary'], agenda: ['Documentation gaps', 'Mock evaluation schedule'], status: 'scheduled', aiProcessed: false, language: 'en-US', meetingType: 'regular', subType: '', projectTitle: '', chairpersonId: '', panelMemberIds: [], adviserId: '' },
  { id: 'm_cap1', title: 'Capstone Title Proposal Defense - Mendoza et al.', date: '2026-07-08T10:00', durationMin: 120, venue: 'CICS Defense Room 1', departmentId: 'dept_cics', chairId: 'u_head', secretaryId: 'u_secretary', participantIds: ['u_head', 'u_secretary', 'u_f2', 'u_f4', 'u_faculty', 'u_st1', 'u_st2', 'u_st3'], agenda: ['Project background', 'Statement of the problem', 'Proposed methodology', 'Q&A'], status: 'approved', aiProcessed: true, language: 'en-US', transcriptId: 't_cap1', minutesId: 'min_cap1', meetingType: 'capstone', subType: 'Title Proposal', projectTitle: 'SmartMin AI: Local-First Institutional Governance Platform for ZPPSU', chairpersonId: 'u_head', panelMemberIds: ['u_f2', 'u_f4'], adviserId: 'u_faculty' },
  { id: 'm_cap2', title: 'Capstone Final Presentation - Mendoza et al.', date: '2026-08-12T13:30', durationMin: 150, venue: 'CICS Auditorium', departmentId: 'dept_cics', chairId: 'u_head', secretaryId: 'u_secretary', participantIds: ['u_head', 'u_secretary', 'u_f2', 'u_f4', 'u_faculty', 'u_st1', 'u_st2', 'u_st3'], agenda: ['Introduction', 'System demonstration', 'Results & evaluation', 'Panel Q&A'], status: 'scheduled', aiProcessed: false, language: 'en-US', meetingType: 'capstone', subType: 'Final Presentation', projectTitle: 'SmartMin AI: Local-First Institutional Governance Platform for ZPPSU', chairpersonId: 'u_head', panelMemberIds: ['u_f2', 'u_f4'], adviserId: 'u_faculty' },
  { id: 'm_cap3', title: 'Capstone Mock Defense - Aquino & Lim', date: '2026-07-25T14:00', durationMin: 90, venue: 'CICS Defense Room 2', departmentId: 'dept_cics', chairId: 'u_head', secretaryId: 'u_secretary', participantIds: ['u_head', 'u_secretary', 'u_f3', 'u_f4', 'u_st2', 'u_st3'], agenda: ['Methodology rehearsal', 'System walkthrough', 'Panel feedback'], status: 'pending_approval', aiProcessed: true, language: 'en-US', transcriptId: 't_cap3', minutesId: 'min_cap3', meetingType: 'capstone', subType: 'Mock Defense', projectTitle: 'AgriTrack: IoT-Based Crop Monitoring for Mindanao Smallholders', chairpersonId: 'u_head', panelMemberIds: ['u_f3', 'u_f4'], adviserId: 'u_f2' },
  { id: 'm_res1', title: 'Research Progress: Local LLM Benchmarking Study', date: '2026-07-18T15:00', durationMin: 60, venue: 'CICS Research Lab', departmentId: 'dept_cics', chairId: 'u_head', secretaryId: 'u_secretary', participantIds: ['u_head', 'u_secretary', 'u_f4'], agenda: ['Dataset coverage', 'Preliminary results', 'Next steps'], status: 'scheduled', aiProcessed: false, language: 'en-US', meetingType: 'research', subType: 'Progress', projectTitle: 'Local LLM Benchmarking Study', chairpersonId: '', panelMemberIds: [], adviserId: 'u_f4' },
];

const transcripts: Transcript[] = [
  {
    id: 't_1', meetingId: 'm_1', language: 'en-US',
    segments: [
      { speakerId: 'u_head', speaker: 'Engr. Ricardo Gomez', t: 0, text: 'Good morning, colleagues. Let us call this Faculty Senate Monthly Sync to order. We have a quorum with eighteen out of twenty members present.' },
      { speakerId: 'u_secretary', speaker: 'Sarah Torres', t: 32, text: 'Thank you, sir. The minutes of the previous meeting on June 20 have been circulated. May I move for their approval?' },
      { speakerId: 'u_f2', speaker: 'Dr. Maria Santos', t: 58, text: 'I second the motion. The minutes were thoroughly reviewed and reflect the discussion accurately.' },
      { speakerId: 'u_head', speaker: 'Engr. Ricardo Gomez', t: 75, text: 'Approved without corrections. Moving on, the first agenda item is the curriculum review for the incoming freshmen. Dr. Villanueva, the floor is yours.' },
      { speakerId: 'u_f4', speaker: 'Prof. Antonette Villanueva', t: 95, text: 'Thank you. We need to finalize the curriculum updates by next week. The board is expecting our compliance report aligned with the new CHED CMO. I propose we set a deadline for August 7 for the syllabus collation.' },
      { speakerId: 'u_head', speaker: 'Engr. Ricardo Gomez', t: 140, text: 'I agree. I’ll ask Prof. Dela Cruz to compile the syllabus drafts. Juan, can you have that ready by Thursday next week?' },
      { speakerId: 'u_faculty', speaker: 'Prof. Juan Dela Cruz', t: 170, text: 'Yes, I will coordinate with the other instructors and consolidate the drafts by Thursday.' },
      { speakerId: 'u_head', speaker: 'Engr. Ricardo Gomez', t: 195, text: 'Excellent. Next, the IT Infrastructure budget. Dr. Santos, please present.' },
      { speakerId: 'u_f2', speaker: 'Dr. Maria Santos', t: 215, text: 'We are proposing a budget of one point two million pesos for laboratory upgrades. Priority is the replacement of obsolete networking equipment in Lab 3. The Finance committee should endorse this to the VP for Academic Affairs by next week.' },
      { speakerId: 'u_head', speaker: 'Engr. Ricardo Gomez', t: 270, text: 'Understood. I will draft the endorsement letter for the IT budget by July 22. Sarah, please record this as an action item.' },
      { speakerId: 'u_secretary', speaker: 'Sarah Torres', t: 300, text: 'Noted, sir. I will tag it in the task board.' },
      { speakerId: 'u_head', speaker: 'Engr. Ricardo Gomez', t: 315, text: 'Lastly, for faculty loading Q3, Dr. Reyes will submit the final schedule conflict report by July 20. With no further business, this meeting is adjourned at 11:30 AM.' },
    ],
    summary: 'The CICS Faculty Senate approved the previous minutes, agreed on a curriculum collation deadline of August 7 aligned with the new CHED CMO, endorsed a PHP 1.2M IT infrastructure budget prioritizing Lab 3 networking, and tasked Prof. Dela Cruz to consolidate syllabus drafts by next Thursday, Engr. Gomez to draft the IT budget endorsement letter by July 22, and Dr. Reyes to submit the schedule conflict report by July 20.',
    translatedTo: null, confidence: 0.98, comments: [],
  },
  {
    id: 't_2', meetingId: 'm_2', language: 'en-US',
    segments: [
      { speakerId: 'u_head', speaker: 'Engr. Ricardo Gomez', t: 0, text: 'Today’s session focuses on the IT infrastructure budget. We have line items for Lab 3 networking, server upgrades, and software licensing.' },
      { speakerId: 'u_f2', speaker: 'Dr. Maria Santos', t: 25, text: 'The networking equipment in Lab 3 is over seven years old and a security risk. I recommend prioritizing its replacement.' },
      { speakerId: 'u_secretary', speaker: 'Sarah Torres', t: 60, text: 'Noted. Will the procurement go through the standard bidding?' },
      { speakerId: 'u_head', speaker: 'Engr. Ricardo Gomez', t: 80, text: 'Yes. Sarah, please coordinate with the Procurement office and draft the request by July 18.' },
    ],
    summary: 'Approved priority replacement of Lab 3 networking due to age and security risk; Sarah to coordinate with Procurement and draft the request by July 18; standard bidding will apply.',
    translatedTo: null, confidence: 0.97, comments: [],
  },
  {
    id: 't_3', meetingId: 'm_3', language: 'en-US',
    segments: [
      { speakerId: 'u_head', speaker: 'Engr. Ricardo Gomez', t: 0, text: 'We need to ensure every CICS program aligns with the new CHED CMO. The deadline for accreditation prep is August 30.' },
      { speakerId: 'u_f4', speaker: 'Prof. Antonette Villanueva', t: 30, text: 'The outcome-based education matrix needs an update. I can lead a workshop next week.' },
      { speakerId: 'u_faculty', speaker: 'Prof. Juan Dela Cruz', t: 70, text: 'I support that. We can use the workshop output as the basis for syllabus revision.' },
    ],
    summary: 'CICS programs to be aligned with new CHED CMO before August 30; Prof. Villanueva to lead an OBE workshop next week with output feeding directly into syllabus revisions.',
    translatedTo: null, confidence: 0.96, comments: [],
  },
  {
    id: 't_cap1', meetingId: 'm_cap1', language: 'en-US',
    segments: [
      { speakerId: 'u_head', speaker: 'Engr. Ricardo Gomez (Chair)', t: 0, text: 'We call this Title Proposal Defense to order. Panel members present: Dr. Santos, Prof. Villanueva. Adviser: Prof. Dela Cruz. Proponents please introduce yourselves.' },
      { speakerId: 'u_st1', speaker: 'Karla Mendoza', t: 28, text: 'Good morning panel. Our proposed title is SmartMin AI: Local-First Institutional Governance Platform for ZPPSU. The system aims to automate meeting minutes through bilingual transcription and AI summarization, while keeping data on-premises.' },
      { speakerId: 'u_st2', speaker: 'Joshua Aquino', t: 75, text: 'Our statement of the problem revolves around how secretaries in ZPPSU spend an average of six hours per meeting on manual minute taking. We aim to reduce this by 80 percent.' },
      { speakerId: 'u_f2', speaker: 'Dr. Maria Santos', t: 140, text: 'How will you handle Tagalog speech recognition? Whisper has limited Filipino support.' },
      { speakerId: 'u_st3', speaker: 'Patricia Lim', t: 168, text: 'We will use Web Speech API with the tl-PH locale plus a custom dictionary-based post-processor. For low-resource fallback, we provide an editable transcript pane.' },
      { speakerId: 'u_f4', speaker: 'Prof. Antonette Villanueva', t: 220, text: 'I recommend you tighten the scope. Mock the offline auto-upload feature first, then expand.' },
      { speakerId: 'u_head', speaker: 'Engr. Ricardo Gomez (Chair)', t: 280, text: 'Panel decision: title approved with the following minor revisions - clarify Local-First scope and add evaluation metrics section. Proponents to submit revised proposal by July 22.' },
    ],
    summary: 'Panel unanimously approved the capstone title "SmartMin AI: Local-First Institutional Governance Platform for ZPPSU" with minor revisions. Proponents to clarify Local-First scope, add evaluation metrics, and submit the revised proposal by July 22. Adviser supports phased delivery starting with offline auto-upload.',
    translatedTo: null, confidence: 0.97,
    comments: [
      { id: 'c1', ts: Date.now() - HOUR * 5, userId: 'u_f2', name: 'Dr. Maria Santos', text: 'Strong proposal overall. Please attach references for the offline-first claim.' },
      { id: 'c2', ts: Date.now() - HOUR * 3, userId: 'u_faculty', name: 'Prof. Juan Dela Cruz', text: 'As adviser, I will work with the team on the evaluation metrics section before July 22.' },
    ],
  },
  {
    id: 't_cap3', meetingId: 'm_cap3', language: 'en-US',
    segments: [
      { speakerId: 'u_head', speaker: 'Engr. Ricardo Gomez (Chair)', t: 0, text: 'This is a mock defense session. The panel will simulate questions to prepare the proponents for their final defense. Begin presentation.' },
      { speakerId: 'u_st2', speaker: 'Joshua Aquino', t: 22, text: 'AgriTrack is an IoT-based crop monitoring platform tailored to smallholder farms in Mindanao. It uses solar-powered ESP32 nodes and an LPWAN gateway.' },
      { speakerId: 'u_f3', speaker: 'Prof. Mark Reyes', t: 95, text: 'How do you ensure connectivity reliability in remote rural areas?' },
      { speakerId: 'u_st3', speaker: 'Patricia Lim', t: 120, text: 'We use LoRaWAN with store-and-forward at the edge. If the gateway loses uplink, data buffers up to seven days.' },
      { speakerId: 'u_f4', speaker: 'Prof. Antonette Villanueva', t: 180, text: 'Action item: revise your evaluation chapter to include the LoRaWAN packet loss tests we discussed last week. Deadline: before the final defense.' },
      { speakerId: 'u_head', speaker: 'Engr. Ricardo Gomez (Chair)', t: 240, text: 'Overall the team is well prepared. Mock defense is endorsed for final scheduling pending the evaluation chapter revision.' },
    ],
    summary: 'AgriTrack mock defense was successful. Panel endorsed proponents for final scheduling, subject to a revision of the evaluation chapter to include LoRaWAN packet-loss test data. Connectivity reliability concerns addressed via LoRaWAN store-and-forward design.',
    translatedTo: null, confidence: 0.96, comments: [],
  },
];

const minutes: Minutes[] = [
  {
    id: 'min_1', meetingId: 'm_1', status: 'pending_approval',
    documentTitle: 'Minutes of the CICS Faculty Senate Monthly Sync',
    callToOrder: 'The meeting was called to order at 09:05 AM by Engr. Ricardo Gomez, College Dean of CICS. A quorum was established with 18 of 20 regular faculty members present.',
    previousMinutes: 'The minutes of the previous meeting held on June 20, 2026 were reviewed. A motion to approve was raised by Prof. Maria Santos and seconded by Dr. Liza Reyes. Approved without corrections.',
    agendaItems: [
      { title: 'CICS Accreditation Prep', notes: 'Dr. Villanueva emphasized the need for updated syllabi matching the new CHED CMO. Target completion for document collation set for August 7. Mock evaluation scheduled mid-August.' },
      { title: 'IT Infrastructure Budget', notes: 'Proposed budget of PHP 1,200,000 for laboratory upgrades was presented. Priority given to replacing obsolete networking equipment in Lab 3. Finance committee to review and endorse to the VP for Academic Affairs.' },
      { title: 'Faculty Loading Q3', notes: 'Preliminary teaching loads distributed for review. Concerns raised regarding overlapping schedules for core major subjects. Adjustments to be finalized in coordination with the Registrar’s office.' },
    ],
    actionItems: ['t_a1', 't_a2', 't_a3'],
    adjournment: 'There being no other matters, the meeting was adjourned at 11:30 AM. Next regular meeting set for August 15, 2026.',
    signatures: [], comments: [], amendments: [], lockedAt: null, lockedBy: null,
  },
  {
    id: 'min_2', meetingId: 'm_2', status: 'pending_approval',
    documentTitle: 'Minutes of the IT Infrastructure Budget Planning',
    callToOrder: 'The meeting was called to order at 02:00 PM by Engr. Ricardo Gomez.',
    previousMinutes: 'Not applicable - special session.',
    agendaItems: [
      { title: 'Lab 3 Networking Replacement', notes: 'Approved as priority; over seven years old; security risk identified.' },
      { title: 'Procurement Path', notes: 'Standard bidding to be followed; Procurement office to be coordinated with by July 18.' },
    ],
    actionItems: ['t_a4'],
    adjournment: 'Adjourned at 03:00 PM.',
    signatures: [], comments: [], amendments: [], lockedAt: null, lockedBy: null,
  },
  {
    id: 'min_3', meetingId: 'm_3', status: 'approved',
    documentTitle: 'Minutes of the Curriculum Review Q3',
    callToOrder: 'The meeting was called to order at 01:00 PM by Engr. Ricardo Gomez.',
    previousMinutes: 'Reviewed and approved.',
    agendaItems: [
      { title: 'CHED CMO Alignment', notes: 'All programs to be aligned by August 30, 2026.' },
      { title: 'OBE Workshop', notes: 'Prof. Villanueva to lead workshop next week; output to feed into syllabus revision.' },
    ],
    actionItems: [],
    adjournment: 'Adjourned at 03:00 PM.',
    signatures: [
      { userId: 'u_secretary', name: 'Sarah Torres', role: 'Faculty Secretary', signedAt: Date.now() - DAY * 3, dataUrl: '' },
      { userId: 'u_head', name: 'Engr. Ricardo Gomez', role: 'College Dean', signedAt: Date.now() - DAY * 2, dataUrl: '' },
    ],
    comments: [], amendments: [], lockedAt: Date.now() - DAY * 2, lockedBy: 'u_head',
  },
  {
    id: 'min_cap1', meetingId: 'm_cap1', status: 'approved',
    documentTitle: 'Minutes of the Capstone Title Proposal Defense',
    callToOrder: 'The Title Proposal Defense was called to order at 10:00 AM by Engr. Ricardo Gomez, College Dean of CICS, with panel members Dr. Maria Santos and Prof. Antonette Villanueva, and adviser Prof. Juan Dela Cruz. All three (3) proponents were present.',
    previousMinutes: 'Not applicable - first defense session.',
    agendaItems: [
      { title: 'Project Background', notes: 'Proponents introduced the SmartMin AI concept, emphasizing the local-first architecture and bilingual AI features for institutional governance.' },
      { title: 'Statement of the Problem', notes: 'Documented that ZPPSU secretaries spend an average of 6 hours per meeting on manual minute taking. Target reduction of 80 percent justified.' },
      { title: 'Proposed Methodology', notes: 'Web Speech API + custom Tagalog dictionary post-processor, MediaRecorder + IndexedDB for offline capture, deterministic templates for fallback summarization.' },
      { title: 'Panel Q&A', notes: 'Dr. Santos questioned Tagalog accuracy; addressed with editable transcript pane. Prof. Villanueva recommended phased delivery, starting with offline auto-upload. Adviser supports the approach.' },
    ],
    actionItems: ['t_cap_a1'],
    adjournment: 'Defense concluded at 12:00 PM with the title approved subject to minor revisions. Revised proposal due July 22, 2026.',
    signatures: [
      { userId: 'u_secretary', name: 'Sarah Torres', role: 'Faculty Secretary', signedAt: Date.now() - HOUR * 48, dataUrl: '' },
      { userId: 'u_head', name: 'Engr. Ricardo Gomez', role: 'College Dean / Chairperson', signedAt: Date.now() - HOUR * 24, dataUrl: '' },
    ],
    comments: [], amendments: [], lockedAt: Date.now() - HOUR * 24, lockedBy: 'u_head',
  },
  {
    id: 'min_cap3', meetingId: 'm_cap3', status: 'pending_approval',
    documentTitle: 'Minutes of the Capstone Mock Defense',
    callToOrder: 'Mock defense session called to order at 02:00 PM by the Chair. Two (2) proponents present, with panel members Prof. Mark Reyes and Prof. Antonette Villanueva, and adviser Dr. Maria Santos.',
    previousMinutes: 'Not applicable - mock session.',
    agendaItems: [
      { title: 'Methodology Rehearsal', notes: 'AgriTrack platform overview: solar-powered ESP32 nodes with LoRaWAN gateway for crop monitoring.' },
      { title: 'System Walkthrough', notes: 'Edge buffering of up to 7 days addresses rural connectivity gaps; live data feed demonstrated.' },
      { title: 'Panel Feedback', notes: 'Panel endorsed proponents for final scheduling, subject to a revision of the evaluation chapter to include LoRaWAN packet-loss tests.' },
    ],
    actionItems: [],
    adjournment: 'Adjourned at 03:30 PM. Final defense scheduling pending evaluation chapter revision.',
    signatures: [
      { userId: 'u_secretary', name: 'Sarah Torres', role: 'Faculty Secretary', signedAt: Date.now() - MIN * 30, dataUrl: '' },
    ],
    comments: [], amendments: [], lockedAt: null, lockedBy: null,
  },
];

const tasks: Task[] = [
  { id: 't_a1', title: 'Update all course syllabi to align with new CMO', description: 'Coordinate with CICS faculty for collation of updated syllabi following CHED Memo Order.', meetingId: 'm_1', departmentId: 'dept_cics', assigneeId: 'u_f4', delegatedBy: 'u_head', priority: 'high', deadline: '2026-08-07', status: 'in_progress', aiExtracted: true },
  { id: 't_a2', title: 'Draft endorsement letter for IT Infrastructure budget', description: 'Endorse PHP 1.2M proposal to VP for Academic Affairs.', meetingId: 'm_1', departmentId: 'dept_cics', assigneeId: 'u_head', delegatedBy: 'u_head', priority: 'medium', deadline: '2026-07-22', status: 'pending', aiExtracted: true },
  { id: 't_a3', title: 'Submit final schedule conflict report', description: 'Compile and finalize Q3 schedule conflicts for the Registrar.', meetingId: 'm_1', departmentId: 'dept_cics', assigneeId: 'u_f2', delegatedBy: 'u_head', priority: 'high', deadline: '2026-07-20', status: 'in_progress', aiExtracted: true },
  { id: 't_a4', title: 'Coordinate Lab 3 procurement with Procurement Office', description: 'Draft procurement request following standard bidding.', meetingId: 'm_2', departmentId: 'dept_cics', assigneeId: 'u_secretary', delegatedBy: 'u_head', priority: 'medium', deadline: '2026-07-18', status: 'pending', aiExtracted: true },
  { id: 't_a5', title: 'Compile syllabus drafts from instructors', description: 'Consolidate the syllabus drafts from all CICS instructors.', meetingId: 'm_1', departmentId: 'dept_cics', assigneeId: 'u_faculty', delegatedBy: 'u_head', priority: 'high', deadline: '2026-07-23', status: 'pending', aiExtracted: true },
  { id: 't_a6', title: 'Review draft minutes for CICS Senate', description: 'Final pass review before signature routing.', meetingId: 'm_1', departmentId: 'dept_cics', assigneeId: 'u_secretary', delegatedBy: 'u_head', priority: 'medium', deadline: '2026-07-17', status: 'done', aiExtracted: false },
  { id: 't_a7', title: 'Lead OBE workshop for CICS faculty', description: 'Prepare and conduct the OBE workshop.', meetingId: 'm_3', departmentId: 'dept_cics', assigneeId: 'u_f4', delegatedBy: 'u_head', priority: 'medium', deadline: '2026-07-25', status: 'done', aiExtracted: true },
  { id: 't_cap_a1', title: 'Submit revised Title Proposal with evaluation metrics', description: 'Clarify Local-First scope and add evaluation metrics section per panel feedback.', meetingId: 'm_cap1', departmentId: 'dept_cics', assigneeId: 'u_st1', delegatedBy: 'u_head', priority: 'high', deadline: '2026-07-22', status: 'in_progress', aiExtracted: true },
];

const personalMeetings: PersonalMeeting[] = [
  { id: 'pm_1', userId: 'u_faculty', date: '2026-07-09', time: '15:00', type: 'Adviser-Advisee', title: 'Capstone Adviser Sync with Mendoza Group', attendees: 'Karla Mendoza, Joshua Aquino, Patricia Lim', notes: 'Reviewed feedback from Title Proposal panel. Agreed on revised methodology section; team to send updated draft by July 18.', createdAt: Date.now() - DAY * 3 },
  { id: 'pm_2', userId: 'u_faculty', date: '2026-07-14', time: '10:30', type: 'Faculty Consultation', title: 'Office Hours - Curriculum Discussion', attendees: 'Prof. Mark Reyes', notes: 'Discussed unit alignment for the upcoming OBE workshop deliverables.', createdAt: Date.now() - DAY },
];

const auditSeed: AuditEntry[] = [
  { id: 'a1', ts: Date.now() - MIN * 42, action: 'transcription_completed', detail: 'Capstone Title Proposal - Mendoza et al.', userId: 'u_admin', userName: 'Dr. Elena Dominguez', role: 'admin' },
  { id: 'a2', ts: Date.now() - HOUR * 25, action: 'minutes_approved', detail: 'Curriculum Review Q3', userId: 'u_head', userName: 'Engr. Ricardo Gomez', role: 'head' },
  { id: 'a3', ts: Date.now() - HOUR * 24, action: 'minutes_locked', detail: 'Capstone Title Proposal Defense locked after Head approval', userId: 'u_head', userName: 'Engr. Ricardo Gomez', role: 'head' },
  { id: 'a4', ts: Date.now() - HOUR * 70, action: 'role_assigned', detail: 'Prof. Mark Reyes - Faculty', userId: 'u_admin', userName: 'Dr. Elena Dominguez', role: 'admin' },
  { id: 'a5', ts: Date.now() - HOUR * 96, action: 'ai_task_extracted', detail: 'Capstone action items extracted by AI', userId: 'u_admin', userName: 'Dr. Elena Dominguez', role: 'admin' },
  { id: 'a6', ts: Date.now() - HOUR * 120, action: 'login', detail: 'Secretary login from campus network', userId: 'u_secretary', userName: 'Sarah Torres', role: 'secretary' },
];

const notifications: Notification[] = [
  { id: 'n1', ts: Date.now() - MIN * 20, read: false, type: 'ai', title: 'Transcription complete', body: 'Capstone Title Proposal Defense transcript is ready for review.', userId: 'u_secretary' },
  { id: 'n2', ts: Date.now() - HOUR, read: false, type: 'approval', title: 'Minutes awaiting signature', body: 'Capstone Mock Defense minutes pending your signature.', userId: 'u_head' },
  { id: 'n3', ts: Date.now() - HOUR * 3, read: true, type: 'task', title: 'New task assigned', body: 'You have been delegated: Compile syllabus drafts.', userId: 'u_faculty' },
];

const taxonomy: Taxonomy = {
  capstone: ['Title Proposal', 'Pre-Oral', 'Mock Defense', 'Final Presentation', 'Other'],
  research: ['Proposal', 'Progress', 'Final'],
};

export function seedIfNeeded() {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(LS_KEYS.seeded)) return;

  write(LS_KEYS.users, users);
  write(LS_KEYS.departments, departments);
  write(LS_KEYS.meetings, meetings);
  write(LS_KEYS.tasks, tasks);
  write(LS_KEYS.transcripts, transcripts);
  write(LS_KEYS.minutes, minutes);
  write(LS_KEYS.audit, auditSeed);
  write(LS_KEYS.notifications, notifications);
  write(LS_KEYS.signatures, []);
  write(LS_KEYS.offlineQueue, []);
  write(LS_KEYS.personalMeetings, personalMeetings);
  write(LS_KEYS.taxonomy, taxonomy);
  write(LS_KEYS.attendance, []);
  window.localStorage.setItem(LS_KEYS.seeded, '1');
}

export function resetSeed() {
  if (typeof window === 'undefined') return;
  Object.values(LS_KEYS).forEach((k) => window.localStorage.removeItem(k));
  seedIfNeeded();
}
