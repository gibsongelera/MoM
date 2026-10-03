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
- ElevenLabs Scribe (speech-to-text, webhook-delivered), Claude (minutes,
  action items, reading handwritten panel notes), Brevo HTTP API (email).

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
- Rollback for 0015–0017: `supabase/rollback/0015-0017_down.sql`.
- The older root app (branch `archive/root-app-2026-10`) is incompatible with
  0015+ (it calls `notify_user`/`log_audit` from the browser). Don't run it.

## Commands
- `npm run dev` · `npm run types` · `npm run lint` · `npm test`
- `npm run db:seed` (base demo) · `npm run db:seed:scenario` (panel demo, see
  `docs/demo-scenario.md`)
- Demo passwords come from `DEMO_PASSWORD_*` in `.env.local` (never commit).
