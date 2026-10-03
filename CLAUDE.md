# ZPPSU SmartMin — project context

SmartMin is an AI-assisted meeting-governance app for Zamboanga Peninsula
Polytechnic State University: schedule or start meetings, record or upload
them, take attendance, keep evidence, and get AI-drafted CHED-format minutes
that the department head signs and locks.

## Stack
- Next.js 16 (App Router, `src/`), React 19, TypeScript strict, Tailwind v4
  (tokens in `src/app/globals.css` `@theme` — do not change brand values:
  maroon `#570000`, gold `#cba72f`, Public Sans / Inter, Material Symbols).
- Supabase Postgres + Auth + Storage. Row Level Security is the access
  boundary; the UI hiding a control is a convenience.
- ElevenLabs Scribe (speech-to-text), Claude (minutes, action items, reading
  handwritten panel notes, the SmartMin Assistant), Brevo HTTP API (email).
- Transcripts arrive by webhook in production, or synchronously inside
  `after()` when no webhook can reach the app (localhost) or none is
  registered — `asrDelivery()` in `src/lib/asr/index.ts`, override with
  `ASR_DELIVERY=webhook|sync`. Both paths store results through
  `src/lib/asr/complete.ts`; every step logs one `[asr] …` line.

## Data and mutation pattern
- Pages are async **server components** reading through
  `createClient()` (`src/lib/supabase/server.ts`) and guarded by
  `requireRole()` / `requireAuth()` (`src/lib/auth/requireRole.ts`; inactive
  accounts are sent to `/login?reason=inactive`).
- Client components write directly through the browser client
  (`src/lib/supabase/client.ts`), check the result (an RLS-denied UPDATE is a
  silent 0-row success — always `.select('id')` and check), then
  `router.refresh()`.
- Workflow state (signatures, approval, locks, comments) changes only through
  SECURITY DEFINER RPCs: `sign_minutes`, `approve_minutes`, `lock_minutes`,
  `amend_minutes` (6-arg), `route_minutes_for_approval`, `append_*_comment`.
  Guard triggers reject direct writes to those columns.
- Notifications are raised by the database (triggers on
  `meeting_participants` / reschedules, and the workflow RPCs). Email is a
  best-effort extra via `POST /api/notify/meeting`.
- Service-role client (`src/lib/supabase/admin.ts`) is server-only and used
  only where there is no user (webhook) or after authorisation (email lookup).

## Meetings model (0016)
- Participants with accounts: `meeting_participants`.
- Typed people: `meetings.guests` (no account), `chairperson_name`,
  `panel_members` `[{name, userId?, affiliation?}]`, `adviser_name`. Linked
  userIds are synced into `chairperson_id` / `panel_member_ids` / `adviser_id`
  and added as participants by trigger.
- `chair_id` is the **approving department head** (defaulted by trigger), not
  the capstone chairperson.
- `is_emergency` marks unscheduled meetings started on the spot.
- Attendance: `attendance.records` built by `src/lib/meetings/roster.ts`.
- Evidence: `meeting_attachments` + private bucket `meeting-attachments`
  (`<meetingId>/<uuid>.<ext>`).

## Minutes format (CHED)
- Minutes follow the order of business of CHED AO No. 06, s. 2014:
  I. Preliminaries (A–G) · II. New Business (matters for approval by
  category) · III. Matters for Confirmation · IV. Other Matters ·
  V. Adjournment, on a ZPPSU + CHED letterhead
  (`public/assets/images/ZppsuLogo.png`, `ched-logo.png`).
- `src/lib/minutes/ched.ts` is the single source: `splitMinutes` /
  `joinMinutes` map the editor to storage (call_to_order, previous_minutes,
  adjournment columns + `agenda_items` items with `section` / `key` /
  `category` / `action`; legacy items read as New Business), and
  `buildChedDocument` builds the tree that the print view
  (`MinutesDocument`), the PDF (`lib/minutes/pdf.tsx`, @react-pdf) and the
  Word file (`lib/minutes/docx.ts`, docx) all render.
- Downloads: `GET /api/minutes/[meetingId]/export?format=pdf|docx` (RLS-scoped).

## Faculty and the assistant
- Personal meetings (0018): private log with CRUD, archive, and the owner's
  own recording in the `personal-audio` bucket (`<userId>/<id>/<uuid>.ext`),
  transcribed by `/api/personal/transcribe` onto the row. Never the official
  meeting record. Faculty can link one to a meeting they can see
  (`/faculty/my-meetings/[id]`).
- SmartMin Assistant: floating chat on every dashboard page
  (`components/assistant/FloatingAssistant.tsx` → `/api/ai/chat`). The
  server rebuilds the context through the caller's RLS client
  (`src/lib/ai/chat.ts`) — never trust context sent by the browser.

## Key places
- Secretary flow: `/secretary/meetings` (list + New / Emergency) →
  `/secretary/meetings/[id]` (Record or upload · Attendance · Attachments ·
  Minutes · Print) → `/secretary/mom-editor?m=` → `/print/meetings/[id]`
  (outside the dashboard layout so only the document prints).
- Shared UI: `src/components/ui/*` (Button, Field, Dialog, Toast, Icon,
  StatusPill, EmptyState). Use them; keep motion inside the tokens
  (`--ease-out`, 120/180/240ms) and respect reduced motion.
- Dates: always `src/lib/utils/datetime.ts` (Asia/Manila).

## Database migrations
- `supabase/migrations/NNNN_name.sql`, applied by `npm run db:push`, tracked by
  filename in `schema_migrations`. **Never reuse a number.** End new files
  with `notify pgrst, 'reload schema';`.
- The direct DB host is IPv6-only: set `SUPABASE_POOLER_HOST` in `.env.local`.
- Before applying: `npm run db:backup`, then `npm run db:verify:pending`
  (applies pending files inside a rolled-back transaction and runs the RLS
  checks). After: `npm run db:verify`.
- Rollback for 0015–0017: `supabase/rollback/0015-0017_down.sql`; for 0018:
  `supabase/rollback/0018_down.sql`. Applied live through 0018; next is 0019.
- The older root app (branch `archive/root-app-2026-10`) is incompatible with
  0015+ (it calls `notify_user`/`log_audit` from the browser). Don't run it.

## Commands
- `npm run dev` · `npm run types` · `npm run lint` · `npm test`
- `npm run db:seed` (base demo) · `npm run db:seed:scenario` (panel demo, see
  `docs/demo-scenario.md`)
- Demo passwords come from `DEMO_PASSWORD_*` in `.env.local` (never commit).
