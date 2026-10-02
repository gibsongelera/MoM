# ZPPSU SmartMin — Project Context (for Claude sessions)

SmartMin is an AI-assisted institutional meeting-governance app for Zamboanga Peninsula Polytechnic
State University (ZPPSU). It records/uploads meetings, transcribes them, and produces summaries,
decisions, delegated tasks, and CHED-format minutes, with a grounded AI assistant and bilingual
(English/Tagalog) support. It is a Next.js migration of an earlier static HTML/CSS/JS demo.

## Stack
- **Next.js 16 (App Router) + React 19 + TypeScript**, **Tailwind v3** (theme ported verbatim from the
  old app so the UI is byte-for-byte identical). Dev: `npm run dev` (port 3000).
- **Client-side data** in `localStorage` + `IndexedDB` (audio blobs), abstracted behind `lib/store.ts`
  so a real DB can be dropped in later without touching pages. Demo data seeds once via `lib/seed.ts`.
- **Real AI** via server-only API routes under `app/api/**` calling **Claude** (`@anthropic-ai/sdk`,
  model `claude-sonnet-5`) and **AssemblyAI** (STT). All keys are server-only (`process.env`); the
  browser never sees them. Every AI call degrades gracefully to an on-device fallback when unconfigured.

## Real backend (Supabase) — the data is LIVE (migrated Aug 2026)
The app is being wired to a **real Supabase Postgres DB + Supabase email auth**. Do NOT reintroduce
localStorage as the source of truth.
- **Schema** lives in `supabase/migrations/0001…0011_*.sql` (UUID keys, Postgres enums, `meeting_participants`
  join table, full RLS via `sm_*` helper functions, SECURITY DEFINER RPCs: `log_audit`, `notify_user`,
  `lock_minutes`, `amend_minutes`, `sign_minutes`, `route_minutes_for_approval`, `append_*_comment`).
  `0011_smartmin_app_fields.sql` is our additive migration (attendance table, `transcripts.key_decisions`,
  `minutes.action_items/paper_notes/translated_to`). Apply with `node --env-file=.env.local scripts/db-push.mjs`
  (idempotent; tracks `schema_migrations`). Seed the full demo with `scripts/seed-demo.mjs`.
- **Clients**: `lib/supabase/{client,server,admin}.ts` + root `middleware.ts` (session refresh + route guard).
- **Auth**: `lib/auth.tsx` uses Supabase sessions; `login`/`logout` are async. Self-registration goes through
  `app/api/auth/register/route.ts` (admin-confirm, no SMTP needed). Reset via `/auth/reset-password` + `/auth/callback`.
- **Data layer**: `lib/db.ts` maps snake_case rows ↔ the camelCase `lib/types.ts` shapes and wraps all
  mutations/RPCs; `components/DataProvider.tsx` loads RLS-scoped collections into memory and exposes
  `useData()`; `lib/scope.ts` holds the pure `scopeX`/`statsFor` helpers. Pages read via `useData()` and
  mutate via `lib/db`, then `refresh()`.
- **STT is ElevenLabs Scribe** (`app/api/transcribe/route.ts`, `ELEVENLABS_API_KEY`) — AssemblyAI was dropped.
- **Conversion status**: auth pages + all 4 role dashboards are on real Supabase data (verified). The remaining
  `app/(app)/**` sub-pages still import `lib/store` (localStorage) and need the same mechanical conversion to
  `useData()` + `lib/db`; until then they render empty. `lib/store.ts` / `lib/seed.ts` are legacy — remove once
  every page is converted.
- **.env.local gotcha**: it previously had duplicate empty keys shadowing the real ANTHROPIC/ELEVENLABS values
  (later dupes win). Keep one definition per key.

## Design tokens (do not change — this is the brand)
- Primary maroon `#570000`, gold/tertiary `#cba72f`. Fonts: Public Sans (headings), Inter (body),
  Material Symbols Outlined (icons). Tokens live in `tailwind.config.ts` + `app/globals.css`
  (ported from the old `assets/js/shared.js` config and `assets/css/theme.css`). Light theme only.

## Roles & scoping
Four roles: `admin`, `head`, `secretary`, `faculty`. Data is scoped by department in `lib/store.ts`
(`scopeMeetings/Tasks/Users/PersonalMeetings`). 8 departments seeded; each has ≤1 head and ≤2
secretaries (enforced in the head "Department Members" page). Auth/session + role guards live in
`lib/auth.tsx` (`useRequireRole`, `AppProvider`). Demo logins: admin@ / president@ / secretary@ /
faculty@zppsu.edu.ph with passwords admin123 / head123 / sec123 / fac123.

## Key directories
- `app/(auth)/` — login, register, forgot-password (no shell).
- `app/(app)/` — authenticated pages under `AppShell` (Sidebar + Topbar). Route folders: `admin/`,
  `head/`, `secretary/`, `faculty/`, plus `assistant/` and `profile/`.
- `app/api/` — `ai/analyze`, `ai/chat`, `ai/translate`, `ai/read-notes`, `transcribe`,
  `export/attendance`.
- `components/` — Sidebar, Topbar, AppShell (`usePageTitle`), Toast (`useToast`), Modal, SignModal,
  Avatar, Calendar, Charts, Kpi, Providers.
- `lib/` — `store`, `seed`, `types`, `auth`, `nav` (NAV_LINKS/ROLE_LABEL/ROLE_DASHBOARDS), `utils`,
  `summarizer` (extractive fallback + `docTitleFor`/`fileNameFor`), `translator` (EN↔TL dictionary
  fallback), `transcriber` (Web Speech + canned fallback), `ai-client` (browser→API helpers),
  `ai/server` (server Anthropic helper).

## AI features (the point of the app — "more than transcription")
Pipeline: **Audio → Transcript → Summary → Decisions → Action Items → Minutes**.
- Upload/live recording try `/api/transcribe` + `/api/ai/analyze`; fall back to the local pipeline.
- **Grounded assistant** (`app/(app)/assistant`): answers ONLY from the open meeting's transcript/
  summary/notes, cites segments, and says "I couldn't find that in this file" otherwise. Fallback is a
  deterministic keyword search that only quotes matching segments (zero hallucination).
- **Handwriting OCR**: mom-editor "Read Panel Notes" → `/api/ai/read-notes` (Claude vision) →
  `minutes.paperNotes[]`, shown separately and mergeable into comments.
- **Bilingual**: transcript + mom-editor "Translate to Tagalog" toggles (Claude via `/api/ai/translate`,
  dictionary fallback). Document translation was the explicit user requirement.
- **Attendance**: `secretary/attendance` → present/absent + per-attendee signatures → signed `.docx`
  via `/api/export/attendance`.

## Adviser (Sir Edgar) requirements this system satisfies
The system must ANALYZE, not just transcribe; produce a comprehensive minutes layout (date, participants,
discussion, decisions, action items, approval); capture attendance; and never lose handwritten panel
notes (they are read and kept alongside the audio-derived content). Research methodology (respondents,
TAM, weighted mean, informed consent) is OUT OF SCOPE for the codebase — it's Chapter-3 documentation.

## Security
`.env.local` holds provider keys and is git-ignored. Rotate them before relying on real AI (an earlier
key was exposed in chat). Keys are used ONLY inside `app/api/**`; never prefix them `NEXT_PUBLIC_`.
See `.env.example` for the required names.

## Conventions
- Authenticated pages are `'use client'`, call `useRequireRole(role)` and `usePageTitle(...)`, read data
  through `useData()` (new) — legacy pages still read `lib/store.ts` until converted — and return `null`
  until `ready` (and `useData().ready`).
- Pages using `useSearchParams` wrap their body in `<Suspense>`.
- Keep the ported Tailwind classes intact to preserve the exact UI.
