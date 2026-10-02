# ZPPSU SmartMin

AI-assisted institutional meeting governance for Zamboanga Peninsula Polytechnic State University —
recording, transcription, summaries, decisions, task delegation, and CHED-format minutes, with a
grounded AI assistant and English/Tagalog support.

Built with **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v3**. This replaces the earlier
static HTML/CSS/JS demo while keeping the exact UI.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Data is stored client-side (localStorage + IndexedDB) and seeds automatically on first load. No database
required. Demo accounts (also one-click on the login page):

| Role      | Email                    | Password  |
| --------- | ------------------------ | --------- |
| Admin     | admin@zppsu.edu.ph       | admin123  |
| Head/Dean | president@zppsu.edu.ph   | head123   |
| Secretary | secretary@zppsu.edu.ph   | sec123    |
| Faculty   | faculty@zppsu.edu.ph     | fac123    |

## Real AI (optional)

The AI features work out of the box on an on-device fallback. To enable **real cloud AI** (grounded
chat, deeper analysis, handwriting OCR, real transcription, quality translation), copy `.env.example`
to `.env.local` and fill in the keys. They are used only server-side in `app/api/**` and are never
exposed to the browser. **Rotate any previously shared keys first.**

## What it does

- **Audio → Transcript → Summary → Decisions → Tasks → Minutes** (not just a transcript viewer)
- **AI Assistant** grounded in the open meeting file, with citations and a no-hallucination guarantee
- **Attendance** with per-attendee signatures, exportable to a signed `.docx`
- **Handwritten panel notes** read from a photo and kept alongside the audio
- **Bilingual** transcript and minutes (EN ↔ TL)
- **Roles**: admin, head/dean, secretary, faculty — with department scoping, approvals & signing,
  a task-delegation kanban, and meeting invitations/RSVP

See `CLAUDE.md` for architecture and conventions.
