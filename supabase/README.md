# Database setup

Project ref: `iurnobtqyrdvanhxghck`

## 1. Add the database settings to `.env.local`

```
DATABASE_URL=postgresql://postgres:<db-password>@db.iurnobtqyrdvanhxghck.supabase.co:5432/postgres
SUPABASE_POOLER_HOST=aws-0-ap-southeast-1.pooler.supabase.com
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

The direct host is IPv6-only; with `SUPABASE_POOLER_HOST` set, the database
scripts connect through the Supavisor session pooler with the same password.

- **`DATABASE_URL`** — Supabase dashboard → **Connect** → *Direct connection*. Only
  the migration runner uses it; the app never does.
- **`SUPABASE_SERVICE_ROLE_KEY`** — dashboard → **Project Settings → API Keys →
  `service_role`**. The seed scripts, the transcription webhook and the email-invitation route use it (server-only). It bypasses RLS, so it
  must never be imported into application code or prefixed `NEXT_PUBLIC_`.

Both are already listed in `.gitignore` via `.env*.local`.

## 2. Turn off email confirmation

Dashboard → **Authentication → Sign In / Providers → Email** → disable
**Confirm email**.

The demo accounts use `@zppsu.edu.ph` addresses that receive no mail. With
confirmation on, every signup — including registrations made through the app —
waits forever for a link nobody can click.

## 3. Apply the schema, then seed

```bash
npm run db:backup           # logical backup first (backups/, gitignored)
npm run db:verify:pending   # dry-run: applies pending files in a rolled-back transaction + RLS checks
npm run db:push
npm run db:verify           # 32 impersonated RLS checks, always rolled back
npm run db:seed
npm run db:seed:scenario    # the panel demo scenario (docs/demo-scenario.md)
```

Migrations: `0001`–`0010` core schema, RLS, functions, storage, transcription;
`0011_amend_minutes_body` + `0011_smartmin_app_fields` (attendance, paper notes),
`0012` RSVPs, `0013` minutes versions/motions, `0014` realtime notifications,
`0015` security hardening, `0016` meeting people (guests, typed panel,
emergency meetings, notifications), `0017` meeting attachments.
Rollback for 0015–0017: `rollback/0015-0017_down.sql`.

`db:push` runs each file in `migrations/` once, inside its own transaction, and
records it in `schema_migrations`. Re-running only applies what is new. To force
one file again: `node --env-file=.env.local scripts/db-push.mjs --force 0002_rls.sql`.

`db:seed` creates the 14 demo accounts (`email_confirm: true`) and their
meetings, transcripts, minutes, tasks, personal meetings, notifications and
audit trail. It is idempotent — existing accounts are reused and their passwords
re-synced. `npm run db:reset` wipes the demo *content* first but keeps accounts.

### No-demo-data option (recommended for production-like setup)

If you only want real auth identities for the 4 roles and **no demo content
rows**, run:

```bash
npm run db:push
npm run db:seed-users-only
```

This creates/updates only:

- `admin@zppsu.edu.ph` (password: `DEMO_PASSWORD_*` in `.env.local`)
- `president@zppsu.edu.ph` (password: `DEMO_PASSWORD_*` in `.env.local`)
- `secretary@zppsu.edu.ph` (password: `DEMO_PASSWORD_*` in `.env.local`)
- `faculty@zppsu.edu.ph` (password: `DEMO_PASSWORD_*` in `.env.local`)

and upserts corresponding `profiles` entries plus `departments.head_id` for
`CICS` and `ICT`.

It does **not** insert rows in `meetings`, `meeting_participants`,
`audio_recordings`, `transcripts`, `minutes`, `tasks`, `personal_meetings`,
`notifications`, `audit_log`, or `app_settings`.

You can verify quickly in SQL editor:

```sql
select count(*) from meetings;
select count(*) from tasks;
select count(*) from transcripts;
select count(*) from minutes;
```

All should be `0` in a users-only seed setup.

## Migration order

| File | Contents |
|---|---|
| `0001_schema.sql` | Enums, 13 tables, indexes, `updated_at` triggers |
| `0002_rls.sql` | Identity/relationship helpers, RLS enabled + policies on every table |
| `0003_functions.sql` | Signup trigger, audit + notification writers, lock/amend/sign state machine |
| `0004_storage.sql` | `meeting-audio` and `avatars` buckets and their policies |
| `0005_reference_data.sql` | 8 departments, capstone/research sub-types, settings row |

## Two things worth knowing before changing policies

**Every helper in `0002` is `SECURITY DEFINER` on purpose.** There are two
reference cycles in this schema, and expressing either as a plain policy
subquery makes Postgres abort with *"infinite recursion detected in policy"*:

1. `profiles → profiles` — a policy on `profiles` that reads `profiles` to
   discover the caller's role.
2. `meetings ⇄ meeting_participants` — meeting visibility depends on
   participation, and participant rows are visible only with their meeting.

Definer rights bypass RLS for those internal lookups and break both cycles.

**The meeting visibility rule lives in exactly one place**, `sm_can_see_meeting()`.
`meetings`, `meeting_participants`, `transcripts`, `minutes`, `audio_recordings`
and the `meeting-audio` storage policies all call it. Change the rule there and
every table follows; restating the predicate per-table is how these drift apart.

## Verifying RLS actually holds

A hidden button is not a policy. To check a role's real boundary, query as that
user rather than trusting the UI:

```js
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
await c.auth.signInWithPassword({ email: 'faculty@zppsu.edu.ph', password: process.env.DEMO_PASSWORD_FACULTY });
const { data } = await c.from('meetings').select('title, department_id');
// expect: only CICS meetings, or meetings this account attends
```

## Bilingual / multilingual transcript rules (EN/TL mixed)

No schema change is needed for English + Tagalog mixed transcripts:

- Set `meetings.language` as the meeting language mode (`en-US`, `tl-PH`,
  `tl-PH-mixed`, `mixed`).
- Store utterances in `transcripts.segments` (`jsonb`) and allow mixed language
  text inside each segment.
- Keep `transcripts.language` as the source language of that transcript row.
- Set `transcripts.translated_to` when writing a translated pass (for example,
  source `tl-PH`, translated `en-US`).
