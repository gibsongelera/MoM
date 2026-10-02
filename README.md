# ZPPSU SmartMin AI - HTML/CSS/JS Demo

An institutional governance platform demo for **Zamboanga Peninsula Polytechnic State University** featuring AI-assisted meeting recording, bilingual transcription (English + Tagalog), CHED-format Minutes of Meeting, task delegation, and signed reports.

## Stack

- **HTML / CSS / vanilla JS** only — **no backend, no database, no build step**
- **Tailwind CSS** via CDN with a shared custom theme (deep maroon `#570000`, gold `#cba72f`, Public Sans + Inter, Material Symbols)
- **Chart.js** for the admin dashboard analytics
- **MediaRecorder API** for audio capture
- **IndexedDB** for audio blob storage (offline-capable)
- **localStorage** for app state (users, meetings, tasks, transcripts, signatures, audit log)
- **Web Speech API** for live in-browser transcription (English + Tagalog) with a canned fallback for unsupported browsers

## Running the demo

The demo is designed to be served from XAMPP. Drop the `SmartMin` folder into `htdocs` (already there) and visit:

```
http://localhost/SmartMin/
```

Or simply open `index.html` directly in Chrome / Edge — most features will still work because everything is client-side. Microphone access requires `https://` or `http://localhost` for security.

## Demo accounts

The login page lists four pre-seeded accounts that demonstrate role separation:

| Role | Email | Password |
|------|-------|----------|
| **System Administrator** | `admin@zppsu.edu.ph` | `DEMO_PASSWORD_*` in `.env.local` |
| **College Dean / Head** | `president@zppsu.edu.ph` | `DEMO_PASSWORD_*` in `.env.local` |
| **Faculty Secretary** | `secretary@zppsu.edu.ph` | `DEMO_PASSWORD_*` in `.env.local` |
| **Faculty Member** | `faculty@zppsu.edu.ph` | `DEMO_PASSWORD_*` in `.env.local` |

Click any account chip on the login page to auto-fill the credentials.

## Suggested defense walkthrough

### Classic flow (institutional meetings)
1. **Landing page (`index.html`)** — Hero, features, role overview, workflow diagram
2. **Sign in as Secretary** — Open **Meeting Schedule**, schedule a meeting (Regular), then go to **Live Recording**
   - Pick language (EN / TL), press **Start Recording**, speak (or watch the canned mock transcript appear)
   - Stop → AI processes → preview the AI Summary + Action Items modal
3. **Go to Transcript Editor** — Edit speakers, click **Translate to Tagalog**, post a comment to participants
4. **Open Document Editor** — Click **AI Generate from Transcript**, edit, **Sign as Secretary**, **Save & Route for Approval**
5. **Sign out and sign in as Head** — Open **Approvals & Signing**, review the routed document, **Sign** with the canvas pad → the document is approved AND locked
6. **Sign back in as Secretary** — Try to edit the locked minutes; the amber **amendment banner** appears, the Head's signature is cleared on save, the status reverts to Pending, and the Head gets a re-approval notification (every edit is logged under **Amendment History**)
7. **Open Task Delegation Board** — Drag a card across columns, assign to a Faculty member
8. **Open Reports** — Auto-generated quarterly report; **Sign** then **Print/PDF**

### Capstone defense flow (new)
1. **Sign in as Secretary** → **Meeting Schedule** → **New Meeting** → set **Type = Capstone**, pick a **Sub-Type** (Title Proposal / Pre-Oral / Mock Defense / Final Presentation), fill in **Project Title**, **Chairperson**, **Panel Members** and **Adviser**. The document title preview updates live.
2. **Live Recording / Upload Audio** — same as before; the capstone meta is preserved on the meeting record.
3. **Transcript Editor** — type a question or feedback into the **Comments** panel; participants get a notification.
4. **Document Editor** — observe the dynamic title (e.g. *Capstone Title Proposal - SmartMin AI:..."*), the Capstone meta header, and the new **Comments** thread under the document.
5. Click **Print/PDF** → the **Pre-Print modal** lets you confirm / override the sub-type and project title; the print filename becomes `ProjectTitle_SubType_YYYY-MM-DD.pdf`.
6. **Archives** — meetings are now grouped into folders by type (Regular / Capstone-by-subtype / Research-by-subtype); each card shows the auto-generated filename.

### Calendar, profile, and personal meetings
1. **Calendar** — every role has its own scoped calendar (Secretary, Head, Faculty). Events are color-coded by meeting type. Faculty's calendar overlays their **Personal Meetings** as dashed cards.
2. **Profile** — click your avatar (top-right or sidebar identity chip) to open the shared `profile.html`. Upload an optional photo (drag-drop or file picker, auto-resized to 384px). Age and gender are intentionally not collected.
3. **Personal Meetings (Faculty)** — log advising sessions, consultations, one-on-ones (date / time / type / attendees / notes). Use **Print / Export** for a printable summary, or open the Calendar to see them inline.

### Admin & cross-department
1. **Sign in as Admin** → **All Meetings** — filter by **Type** (Regular / Capstone / Research) and see new pills for **Locked** documents and **N amend** counters.
2. **User Management** — `u_s2` (CET Secretary) is pre-activated to demonstrate the admin-creates-cross-dept-secretary scenario.
3. **Audit & Privacy** — every new mutation (lock, amend, comment_posted, profile_updated, personal_meeting_created, calendar_view, taxonomy_updated, pre_print_confirmed, minutes_locked) is captured in the audit trail.

### Offline behavior
- Toggle airplane mode / DevTools offline → record again as secretary; the audio queues in IndexedDB and auto-syncs (with AI processing) on reconnect.

## Key offline-first behaviors

- Audio recording continues even when offline (saved to IndexedDB).
- Reconnecting fires a `online` event that triggers automatic transcription + summarization of queued recordings.
- A toast announces "Synced N offline recordings".

## File structure

```
SmartMin/
├── index.html                  Landing
├── login.html                  4 demo accounts + role routing
├── register.html               Self-registration
├── forgot-password.html
├── profile.html                Shared profile page (name + position + optional photo)
├── assets/
│   ├── css/theme.css           Shared theme, glass panels, kanban, calendar, lock/amend banners, print styles
│   ├── js/
│   │   ├── shared.js           Layout injector, auth guard, role router, toast system, avatar helper
│   │   ├── store.js            localStorage + IndexedDB + audit log + lock/amend helpers + taxonomy
│   │   ├── seed.js             Demo data (14 users, 8 departments, 10 meetings inc. 3 capstone + 1 research, 5 transcripts, 8 tasks, 2 personal meetings)
│   │   ├── recorder.js         MediaRecorder + offline queue + auto-upload
│   │   ├── transcriber.js      Web Speech + canned demo fallback
│   │   ├── translator.js       EN↔TL dictionary translator
│   │   ├── summarizer.js       Extractive summary + action-item extractor + docTitleFor + fileNameFor
│   │   ├── signature.js        Canvas signature pad
│   │   ├── charts.js           Chart.js helpers
│   │   └── calendar.js         Month grid widget (color-coded by meeting type)
│   └── partials/               Sidebar + topbar reference snippets
├── admin/                      dashboard, users, departments, meetings (with lock/amend pills + Type filter), audit, settings
├── head/                       dashboard, calendar, approvals (locks on final sign), delegate, reports
├── secretary/                  dashboard, calendar, schedule (Regular/Capstone/Research), live-recording, upload-audio, transcript (with comments), mom-editor (lock-aware + comments + pre-print modal), archives (folder grouping)
└── faculty/                    dashboard, calendar, my-tasks, my-meetings, personal-meetings (new), transcript-view (read-only comments)
```

## Reset the demo

If the local state gets messy, sign in as Admin and use:
- **System Settings → Reset Demo Data** (resets to factory defaults), or
- **Audit & Privacy → Local Data Wipe** (clears everything, reseeds, signs out)

Or open DevTools and run `localStorage.clear()` + refresh.

## Privacy &amp; compliance

- The former **Local Processing Only** badge has been corrected. Even in this HTML-only demo, the in-browser transcriber uses `window.SpeechRecognition`, which in Chrome streams audio to Google's servers — recording was never fully on-device, so the badge now reads "Encrypted Processing" / "Encrypted &amp; Audited" instead.
- Every mutation (login, recording saved, MoM signed, task created/edited/deleted, settings changed, user CRUD, etc.) writes an entry to `localStorage.sm_audit`.
- The Audit page exports CSV and JSON backups; a retention slider sets the auto-delete window.
- Aligned with ZPPSU's Data Privacy Manual and the Data Privacy Act of 2012 (RA 10173).

### The `feat/nextjs-supabase` branch (in progress)

A parallel Next.js + Supabase rewrite lives on this branch, with a genuinely different data flow that must be disclosed accurately rather than inheriting the "local only" framing above:

- Audio recordings upload to **Supabase Storage** (a private bucket, access-scoped to the meeting via row-level security).
- Recordings are sent to **ElevenLabs** for transcription (speech-to-text and speaker diarization).
- Transcripts are sent to **Anthropic** (Claude) to draft summaries, action items, and Minutes of the Meeting.
- `app_settings.data_processing_notice` holds the user-facing text describing this pipeline; it explicitly states processing is not on-device only.
- **Consult ZPPSU's Data Protection Officer before recording any real meeting** on this branch — this is an RA 10173 requirement, not a nicety. A pre-recording consent gate (participants informed the session is recorded and machine-transcribed, logged to `audit_log`) is required before real use and is tracked as follow-up UI work.
