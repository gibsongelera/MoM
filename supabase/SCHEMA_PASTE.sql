-- ==========================================================================
-- SmartMin — complete schema, paste-ready
-- ==========================================================================
--
-- GENERATED FILE — do not edit by hand. Change the migration, then run:
--   node scripts/build-schema-paste.mjs
--
-- Contents (supabase/migrations/, concatenated in filename order):
--   0001_schema.sql
--   0002_rls.sql
--   0003_functions.sql
--   0004_storage.sql
--   0005_reference_data.sql
--   0006_profile_privilege_guard.sql
--   0007_privacy.sql
--   0008_transcription.sql
--   0009_transcription_rls.sql
--   0010_minutes_ai_action_items.sql
--   0011_amend_minutes_body.sql
--   0011_smartmin_app_fields.sql
--   0012_meeting_rsvps.sql
--   0013_governance_extras.sql
--   0014_realtime.sql
--   0015_security_hardening.sql
--   0016_meeting_people.sql
--   0017_meeting_attachments.sql
--
-- Usage: paste this whole file into the Supabase SQL editor and run it once, on
-- a project where these objects do not exist yet. The editor sends the script as
-- a single multi-statement query, which Postgres runs as one implicit
-- transaction — a failure anywhere rolls the entire bundle back, so you never
-- end up with half a schema.
--
-- The final section records each file in schema_migrations. Without it, a later
-- 'npm run db:push' would try to replay 0001 and abort on "type already exists".
--
-- Accounts are NOT created here. Run 'npm run db:seed-users-only' afterwards.

-- ==========================================================================
-- BEGIN 0001_schema.sql
-- ==========================================================================

-- ============================================================================
-- SmartMin schema
--
-- Ported from the localStorage model in assets/js/store.js + assets/js/seed.js.
-- Key differences from the legacy shape:
--   * profiles.id is a FK to auth.users — Supabase Auth owns credentials, so
--     there is no password column anywhere.
--   * meeting participants are a join table rather than a JS array, so
--     attendance is queryable and indexable.
--   * jsonb is kept for genuinely document-shaped data (transcript segments,
--     agenda item notes, signatures, amendments, comments) where the legacy
--     editors read and write the whole blob at once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('admin', 'head', 'secretary', 'faculty');

create type department_type as enum ('college', 'office');

create type meeting_type as enum ('regular', 'capstone', 'research');

create type meeting_status as enum (
  'scheduled',
  'recording',
  'transcribed',
  'pending_approval',
  'approved',
  'archived'
);

create type minutes_status as enum ('draft', 'pending_approval', 'approved');

create type task_status as enum ('pending', 'in_progress', 'done');

create type task_priority as enum ('low', 'medium', 'high');

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------
create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short text not null unique,
  type department_type not null default 'college',
  head_id uuid,                       -- FK added after profiles exists
  office_location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger departments_set_updated_at
  before update on departments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role user_role not null default 'faculty',
  department_id uuid references departments (id) on delete set null,
  position text,
  active boolean not null default true,
  joined_at date,
  photo_path text,                    -- object path in the avatars bucket
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_department_idx on profiles (department_id);
create index profiles_role_idx on profiles (role);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

alter table departments
  add constraint departments_head_id_fkey
  foreign key (head_id) references profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- meeting_subtypes  (replaces the sm_meeting_taxonomy blob)
-- ---------------------------------------------------------------------------
create table meeting_subtypes (
  id uuid primary key default gen_random_uuid(),
  meeting_type meeting_type not null,
  label text not null,
  position integer not null default 0,
  unique (meeting_type, label)
);

-- ---------------------------------------------------------------------------
-- meetings
-- ---------------------------------------------------------------------------
create table meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  duration_min integer not null default 60,
  venue text,
  department_id uuid not null references departments (id) on delete restrict,
  chair_id uuid references profiles (id) on delete set null,
  secretary_id uuid references profiles (id) on delete set null,
  agenda text[] not null default '{}',
  status meeting_status not null default 'scheduled',
  ai_processed boolean not null default false,
  language text not null default 'en-US',

  -- capstone / research attributes
  meeting_type meeting_type not null default 'regular',
  sub_type text,
  project_title text,
  chairperson_id uuid references profiles (id) on delete set null,
  panel_member_ids uuid[] not null default '{}',
  adviser_id uuid references profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A capstone or research meeting is meaningless without its sub-type.
  constraint meetings_subtype_required
    check (meeting_type = 'regular' or sub_type is not null)
);

create index meetings_department_idx on meetings (department_id);
create index meetings_starts_at_idx on meetings (starts_at desc);
create index meetings_status_idx on meetings (status);
create index meetings_type_idx on meetings (meeting_type);
create index meetings_secretary_idx on meetings (secretary_id);

create trigger meetings_set_updated_at
  before update on meetings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- meeting_participants
-- ---------------------------------------------------------------------------
create table meeting_participants (
  meeting_id uuid not null references meetings (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  attended boolean,
  primary key (meeting_id, user_id)
);

create index meeting_participants_user_idx on meeting_participants (user_id);

-- ---------------------------------------------------------------------------
-- audio_recordings
--
-- Rows exist as soon as a recording is captured, even while the blob is still
-- only in the browser's IndexedDB. storage_path stays null until it syncs.
-- ---------------------------------------------------------------------------
create table audio_recordings (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings (id) on delete cascade,
  storage_path text,
  duration_sec integer not null default 0,
  language text not null default 'en-US',
  mime_type text not null default 'audio/webm',
  captured_at timestamptz not null default now(),
  uploaded_at timestamptz,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index audio_recordings_meeting_idx on audio_recordings (meeting_id);

-- ---------------------------------------------------------------------------
-- transcripts
--
-- segments: [{ speakerId, speaker, t, text }]
-- comments: [{ id, ts, userId, name, text }]
-- ---------------------------------------------------------------------------
create table transcripts (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  language text not null default 'en-US',
  segments jsonb not null default '[]'::jsonb,
  summary text,
  translated_to text,
  confidence numeric(4, 3),
  comments jsonb not null default '[]'::jsonb,
  source_audio_id uuid references audio_recordings (id) on delete set null,
  ai_model text,                      -- which engine produced this pass
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transcripts_meeting_idx on transcripts (meeting_id);

create trigger transcripts_set_updated_at
  before update on transcripts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- minutes
--
-- agenda_items: [{ title, notes }]
-- signatures:   [{ userId, name, role, signedAt, dataUrl }]
-- amendments:   [{ ts, byUserId, byName, summary }]
-- comments:     [{ id, ts, userId, name, text }]
-- ---------------------------------------------------------------------------
create table minutes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null unique references meetings (id) on delete cascade,
  document_title text,
  call_to_order text,
  previous_minutes text,
  agenda_items jsonb not null default '[]'::jsonb,
  adjournment text,
  ai_summary text,
  signatures jsonb not null default '[]'::jsonb,
  comments jsonb not null default '[]'::jsonb,
  amendments jsonb not null default '[]'::jsonb,
  status minutes_status not null default 'draft',
  locked_at timestamptz,
  locked_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A lock always records who applied it.
  constraint minutes_lock_consistent
    check ((locked_at is null) = (locked_by is null))
);

create index minutes_status_idx on minutes (status);

create trigger minutes_set_updated_at
  before update on minutes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  meeting_id uuid references meetings (id) on delete set null,
  department_id uuid references departments (id) on delete set null,
  assignee_id uuid references profiles (id) on delete set null,
  delegated_by uuid references profiles (id) on delete set null,
  priority task_priority not null default 'medium',
  deadline date,
  status task_status not null default 'pending',
  ai_extracted boolean not null default false,
  confidence numeric(4, 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_assignee_idx on tasks (assignee_id);
create index tasks_department_idx on tasks (department_id);
create index tasks_meeting_idx on tasks (meeting_id);
create index tasks_status_idx on tasks (status);

create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- personal_meetings  (faculty's own advising / consultation log)
-- ---------------------------------------------------------------------------
create table personal_meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  meeting_date date not null,
  meeting_time time,
  type text,
  title text not null,
  attendees text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index personal_meetings_user_idx on personal_meetings (user_id, meeting_date desc);

create trigger personal_meetings_set_updated_at
  before update on personal_meetings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- audit_log
--
-- user_id is nullable and ON DELETE SET NULL: the trail has to outlive the
-- account it describes. user_name is denormalised for the same reason.
-- ---------------------------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete set null,
  user_name text,
  role user_role,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on audit_log (created_at desc);
create index audit_log_action_idx on audit_log (action);

-- ---------------------------------------------------------------------------
-- app_settings  (single row, mirrors SMStore.getSettings())
-- ---------------------------------------------------------------------------
create table app_settings (
  id boolean primary key default true,
  ai_enabled boolean not null default true,
  auto_transcribe boolean not null default true,
  auto_summarize boolean not null default true,
  auto_upload_on_reconnect boolean not null default true,
  local_processing_only boolean not null default false,
  retention_days integer not null default 365,
  default_language text not null default 'en-US',
  institution_name text not null default 'Zamboanga Peninsula Polytechnic State University',
  institution_short text not null default 'ZPPSU',
  updated_at timestamptz not null default now(),
  constraint app_settings_single_row check (id)
);

create trigger app_settings_set_updated_at
  before update on app_settings
  for each row execute function set_updated_at();

-- ==========================================================================
-- END 0001_schema.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0002_rls.sql
-- ==========================================================================

-- ============================================================================
-- Row Level Security
--
-- This replaces the scopeMeetings / scopeTasks / scopeUsers /
-- scopePersonalMeetings helpers in assets/js/store.js. Those were client-side
-- array filters — cosmetic, and trivially bypassed from the console. The same
-- rules are now enforced by Postgres, so the UI hiding a control is a
-- convenience, not the security boundary.
--
-- ## Why every helper below is SECURITY DEFINER
--
-- Policies that read other RLS-protected tables deadlock on themselves. Two
-- cycles exist in this schema:
--
--   1. profiles  -> profiles   : a policy on profiles that selects from
--      profiles to discover the caller's role recurses immediately.
--   2. meetings <-> meeting_participants : meeting visibility depends on
--      participation, and participant rows are visible only with the meeting.
--      Expressed as policy subqueries, each one re-enters the other and
--      Postgres aborts with "infinite recursion detected in policy".
--
-- Definer-rights functions bypass RLS for their own lookups, which breaks both
-- cycles. Each is pinned to an explicit search_path so a rogue temp schema
-- cannot shadow the tables it reads.
--
-- The meeting visibility rule is written exactly once, in sm_can_see_meeting().
-- Every policy that needs it calls that function rather than restating the
-- predicate, so the rule cannot drift between tables.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Caller identity
-- ---------------------------------------------------------------------------
create or replace function sm_role()
returns user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function sm_department()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select department_id from profiles where id = auth.uid();
$$;

create or replace function sm_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select role from profiles where id = auth.uid()) = 'admin', false);
$$;

-- ---------------------------------------------------------------------------
-- Relationship tests
-- ---------------------------------------------------------------------------

-- Casts a storage folder segment to uuid without throwing on junk input. A
-- policy that raises turns a denial into a 500, so this returns null instead.
create or replace function sm_uuid_or_null(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

create or replace function sm_is_participant(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from meeting_participants
    where meeting_id = p_meeting_id and user_id = auth.uid()
  );
$$;

create or replace function sm_shares_meeting_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from meeting_participants mine
    join meeting_participants theirs on theirs.meeting_id = mine.meeting_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
  );
$$;

/*
 * THE meeting visibility rule. Port of scopeMeetings():
 *   admin      -> everything
 *   head       -> own department
 *   secretary  -> own department, or any meeting they are minuting
 *   faculty    -> own department, or any meeting they attend
 */
create or replace function sm_can_see_meeting(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from meetings m
    where m.id = p_meeting_id
      and (
        sm_is_admin()
        or (sm_role() = 'head' and m.department_id = sm_department())
        or (sm_role() = 'secretary'
            and (m.department_id = sm_department() or m.secretary_id = auth.uid()))
        or (sm_role() = 'faculty'
            and (m.department_id = sm_department() or sm_is_participant(m.id)))
      )
  );
$$;

-- True when the caller may edit a meeting's derived documents.
create or replace function sm_can_edit_meeting_docs(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from meetings m
    where m.id = p_meeting_id
      and (
        sm_is_admin()
        or m.secretary_id = auth.uid()
        or m.chair_id = auth.uid()
        or (sm_role() in ('head', 'secretary') and m.department_id = sm_department())
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. Nothing is readable until a policy says so.
-- ---------------------------------------------------------------------------
alter table departments enable row level security;
alter table profiles enable row level security;
alter table meeting_subtypes enable row level security;
alter table meetings enable row level security;
alter table meeting_participants enable row level security;
alter table audio_recordings enable row level security;
alter table transcripts enable row level security;
alter table minutes enable row level security;
alter table tasks enable row level security;
alter table personal_meetings enable row level security;
alter table notifications enable row level security;
alter table audit_log enable row level security;
alter table app_settings enable row level security;

-- ---------------------------------------------------------------------------
-- departments — readable by everyone signed in, written by admins
-- ---------------------------------------------------------------------------
create policy departments_select on departments
  for select to authenticated using (true);

create policy departments_write on departments
  for all to authenticated using (sm_is_admin()) with check (sm_is_admin());

-- ---------------------------------------------------------------------------
-- profiles
--
-- Faculty could see only themselves in the legacy filter, which would now blank
-- out every participant list, task assignee and comment author in the UI. The
-- rule here is: yourself, anyone in your department, or anyone you share a
-- meeting with. Admins see the full directory.
-- ---------------------------------------------------------------------------
create policy profiles_select on profiles
  for select to authenticated using (
    id = auth.uid()
    or sm_is_admin()
    or (department_id is not null and department_id = sm_department())
    or sm_shares_meeting_with(id)
  );

-- Everyone maintains their own profile; only admins may change anyone's.
create policy profiles_update_self on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_admin_write on profiles
  for all to authenticated using (sm_is_admin()) with check (sm_is_admin());

-- ---------------------------------------------------------------------------
-- meeting_subtypes — read-only reference data, admin-maintained
-- ---------------------------------------------------------------------------
create policy meeting_subtypes_select on meeting_subtypes
  for select to authenticated using (true);

create policy meeting_subtypes_write on meeting_subtypes
  for all to authenticated using (sm_is_admin()) with check (sm_is_admin());

-- ---------------------------------------------------------------------------
-- meetings
-- ---------------------------------------------------------------------------
create policy meetings_select on meetings
  for select to authenticated using (sm_can_see_meeting(id));

-- Secretaries schedule meetings for their department; heads and admins too.
create policy meetings_insert on meetings
  for insert to authenticated with check (
    sm_is_admin()
    or (sm_role() in ('head', 'secretary') and department_id = sm_department())
  );

create policy meetings_update on meetings
  for update to authenticated
  using (sm_can_edit_meeting_docs(id))
  with check (sm_can_edit_meeting_docs(id));

create policy meetings_delete on meetings
  for delete to authenticated using (sm_is_admin());

-- ---------------------------------------------------------------------------
-- meeting_participants — visible with the meeting, managed by its organisers
-- ---------------------------------------------------------------------------
create policy meeting_participants_select on meeting_participants
  for select to authenticated using (sm_can_see_meeting(meeting_id));

create policy meeting_participants_write on meeting_participants
  for all to authenticated
  using (sm_can_edit_meeting_docs(meeting_id))
  with check (sm_can_edit_meeting_docs(meeting_id));

-- ---------------------------------------------------------------------------
-- audio_recordings
-- ---------------------------------------------------------------------------
create policy audio_recordings_select on audio_recordings
  for select to authenticated using (
    created_by = auth.uid()
    or (meeting_id is not null and sm_can_see_meeting(meeting_id))
  );

create policy audio_recordings_insert on audio_recordings
  for insert to authenticated with check (
    created_by = auth.uid() and sm_role() in ('admin', 'head', 'secretary')
  );

create policy audio_recordings_update on audio_recordings
  for update to authenticated
  using (created_by = auth.uid() or sm_is_admin())
  with check (created_by = auth.uid() or sm_is_admin());

create policy audio_recordings_delete on audio_recordings
  for delete to authenticated using (created_by = auth.uid() or sm_is_admin());

-- ---------------------------------------------------------------------------
-- transcripts — visible with the meeting; edited by its secretary/chair/admin
--
-- Faculty post comments on transcripts, which is an UPDATE of the comments
-- column. Column-level restriction is not expressible in a policy, so the
-- comment path goes through append_transcript_comment() in 0003_functions.sql
-- and faculty get no direct UPDATE here.
-- ---------------------------------------------------------------------------
create policy transcripts_select on transcripts
  for select to authenticated using (sm_can_see_meeting(meeting_id));

create policy transcripts_write on transcripts
  for all to authenticated
  using (sm_can_edit_meeting_docs(meeting_id))
  with check (sm_can_edit_meeting_docs(meeting_id));

-- ---------------------------------------------------------------------------
-- minutes
--
-- Locking and amending are deliberately absent here: both are multi-step state
-- machines and run through SECURITY DEFINER functions so the steps cannot be
-- performed piecemeal (e.g. clearing a lock without recording the amendment).
-- ---------------------------------------------------------------------------
create policy minutes_select on minutes
  for select to authenticated using (sm_can_see_meeting(meeting_id));

create policy minutes_insert on minutes
  for insert to authenticated with check (sm_can_edit_meeting_docs(meeting_id));

-- A locked document is read-only until amend_minutes() reopens it.
create policy minutes_update on minutes
  for update to authenticated
  using (sm_can_edit_meeting_docs(meeting_id) and locked_at is null)
  with check (sm_can_edit_meeting_docs(meeting_id));

create policy minutes_delete on minutes
  for delete to authenticated using (sm_is_admin());

-- ---------------------------------------------------------------------------
-- tasks — mirrors scopeTasks()
-- ---------------------------------------------------------------------------
create policy tasks_select on tasks
  for select to authenticated using (
    sm_is_admin()
    or assignee_id = auth.uid()
    or delegated_by = auth.uid()
    or (sm_role() in ('head', 'secretary') and department_id = sm_department())
  );

create policy tasks_insert on tasks
  for insert to authenticated with check (
    sm_is_admin() or sm_role() in ('head', 'secretary')
  );

/*
 * Faculty may update their own tasks (the board only lets them move status).
 * Heads and secretaries manage the whole department backlog.
 */
create policy tasks_update on tasks
  for update to authenticated using (
    sm_is_admin()
    or assignee_id = auth.uid()
    or (sm_role() in ('head', 'secretary') and department_id = sm_department())
  ) with check (
    sm_is_admin()
    or assignee_id = auth.uid()
    or (sm_role() in ('head', 'secretary') and department_id = sm_department())
  );

create policy tasks_delete on tasks
  for delete to authenticated using (
    sm_is_admin() or (sm_role() in ('head', 'secretary') and department_id = sm_department())
  );

-- ---------------------------------------------------------------------------
-- personal_meetings — strictly the owner's, plus admin oversight
-- ---------------------------------------------------------------------------
create policy personal_meetings_select on personal_meetings
  for select to authenticated using (user_id = auth.uid() or sm_is_admin());

create policy personal_meetings_write on personal_meetings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notifications — recipients read and dismiss their own
-- ---------------------------------------------------------------------------
create policy notifications_select on notifications
  for select to authenticated using (user_id = auth.uid() or sm_is_admin());

create policy notifications_update on notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_delete on notifications
  for delete to authenticated using (user_id = auth.uid() or sm_is_admin());

/*
 * No INSERT policy. Notifications are raised on someone else's behalf, so they
 * are written by notify_user() (SECURITY DEFINER) — otherwise any user could
 * fabricate a notification for anyone.
 */

-- ---------------------------------------------------------------------------
-- audit_log — admin-readable, append-only via log_audit()
-- ---------------------------------------------------------------------------
create policy audit_log_select on audit_log
  for select to authenticated using (sm_is_admin());

/*
 * No INSERT / UPDATE / DELETE policies at all. Entries are appended by
 * log_audit() (SECURITY DEFINER) so the actor cannot be spoofed and history
 * cannot be rewritten.
 */

-- ---------------------------------------------------------------------------
-- app_settings — readable by all, writable by admins
-- ---------------------------------------------------------------------------
create policy app_settings_select on app_settings
  for select to authenticated using (true);

create policy app_settings_write on app_settings
  for all to authenticated using (sm_is_admin()) with check (sm_is_admin());

-- ==========================================================================
-- END 0002_rls.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0003_functions.sql
-- ==========================================================================

-- ============================================================================
-- Server-side behaviour
--
-- Anything that has to happen as one indivisible step, or that writes on
-- another user's behalf, lives here rather than in a Server Action. Two
-- reasons: a half-applied amendment leaves a signed document in an
-- unrepresentable state, and a client that can insert its own audit rows or
-- notifications can forge them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Provision a profile when a new auth user is created.
--
-- Register submits name / position / department through the sign-up metadata;
-- self-registered accounts are always faculty and inactive until an admin
-- activates them, matching the legacy register.html flow.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw text := nullif(new.raw_user_meta_data ->> 'department_id', '');
  v_dept uuid;
begin
  /*
   * Accept either a department UUID or a short code such as 'CICS'. Resolve
   * through the departments table either way: a syntactically valid UUID that
   * does not exist would otherwise fail the profiles FK and abort the signup
   * with an opaque error.
   */
  if v_raw is not null then
    select id into v_dept
    from departments
    where id = sm_uuid_or_null(v_raw) or short = upper(v_raw)
    limit 1;
  end if;

  insert into profiles (id, name, email, role, department_id, position, active, joined_at)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'faculty'),
    v_dept,
    nullif(new.raw_user_meta_data ->> 'position', ''),
    coalesce((new.raw_user_meta_data ->> 'active')::boolean, false),
    current_date
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Audit trail. Append-only; the actor is taken from the session, never trusted
-- from the caller.
-- ---------------------------------------------------------------------------
create or replace function log_audit(p_action text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_role user_role;
begin
  select name, role into v_name, v_role from profiles where id = auth.uid();

  insert into audit_log (user_id, user_name, role, action, detail)
  values (auth.uid(), coalesce(v_name, 'Anonymous'), v_role, p_action, p_detail);
end;
$$;

-- ---------------------------------------------------------------------------
-- Raise a notification for another user.
-- ---------------------------------------------------------------------------
create or replace function notify_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into notifications (user_id, type, title, body)
  values (p_user_id, p_type, p_title, p_body);
end;
$$;

-- ---------------------------------------------------------------------------
-- Comment threads.
--
-- Appending a comment is an UPDATE of one jsonb column, which a policy cannot
-- express — granting UPDATE would let a faculty member rewrite the whole
-- document. These functions gate on read access instead, so anyone who can see
-- the meeting can comment, and nothing else.
-- ---------------------------------------------------------------------------
create or replace function append_transcript_comment(p_transcript_id uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meeting_id uuid;
  v_comment jsonb;
  v_result jsonb;
  v_name text;
begin
  if coalesce(btrim(p_text), '') = '' then
    raise exception 'Comment text is required';
  end if;

  select meeting_id into v_meeting_id from transcripts where id = p_transcript_id;
  if v_meeting_id is null then
    raise exception 'Transcript % not found', p_transcript_id;
  end if;

  if not sm_can_see_meeting(v_meeting_id) then
    raise exception 'Not permitted to comment on this transcript';
  end if;

  select name into v_name from profiles where id = auth.uid();

  v_comment := jsonb_build_object(
    'id', gen_random_uuid(),
    'ts', (extract(epoch from now()) * 1000)::bigint,
    'userId', auth.uid(),
    'name', coalesce(v_name, 'Unknown'),
    'text', p_text
  );

  update transcripts
  set comments = comments || jsonb_build_array(v_comment)
  where id = p_transcript_id
  returning comments into v_result;

  perform log_audit('comment_posted', 'Transcript comment on meeting ' || v_meeting_id);

  -- Everyone else on the meeting hears about it.
  perform notify_user(mp.user_id, 'task', 'New comment on transcript',
                      coalesce(v_name, 'Someone') || ': ' || left(p_text, 80))
  from meeting_participants mp
  where mp.meeting_id = v_meeting_id and mp.user_id <> auth.uid();

  return v_result;
end;
$$;

create or replace function append_minutes_comment(p_minutes_id uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meeting_id uuid;
  v_chair_id uuid;
  v_comment jsonb;
  v_result jsonb;
  v_name text;
begin
  if coalesce(btrim(p_text), '') = '' then
    raise exception 'Comment text is required';
  end if;

  select mi.meeting_id, m.chair_id
    into v_meeting_id, v_chair_id
  from minutes mi
  join meetings m on m.id = mi.meeting_id
  where mi.id = p_minutes_id;

  if v_meeting_id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not sm_can_see_meeting(v_meeting_id) then
    raise exception 'Not permitted to comment on these minutes';
  end if;

  select name into v_name from profiles where id = auth.uid();

  v_comment := jsonb_build_object(
    'id', gen_random_uuid(),
    'ts', (extract(epoch from now()) * 1000)::bigint,
    'userId', auth.uid(),
    'name', coalesce(v_name, 'Unknown'),
    'text', p_text
  );

  -- Commenting is allowed on a locked document; editing it is not.
  update minutes
  set comments = comments || jsonb_build_array(v_comment)
  where id = p_minutes_id
  returning comments into v_result;

  perform log_audit('comment_posted', 'Minutes comment on meeting ' || v_meeting_id);

  if v_chair_id is not null and v_chair_id <> auth.uid() then
    perform notify_user(v_chair_id, 'task', 'New comment on minutes',
                        coalesce(v_name, 'Someone') || ': ' || left(p_text, 80));
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approve and lock. Called when the head signs off.
--
-- One statement each for the document and its meeting, so a signed document is
-- never left unlocked or a locked document left pending.
-- ---------------------------------------------------------------------------
create or replace function lock_minutes(p_minutes_id uuid)
returns minutes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row minutes;
  v_meeting meetings;
begin
  select * into v_meeting
  from meetings
  where id = (select meeting_id from minutes where id = p_minutes_id);

  if v_meeting.id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  -- Only the chair of the meeting, a head in that department, or an admin.
  if not (
    sm_is_admin()
    or v_meeting.chair_id = auth.uid()
    or (sm_role() = 'head' and v_meeting.department_id = sm_department())
  ) then
    raise exception 'Only the chairperson or an administrator can approve these minutes';
  end if;

  update minutes
  set locked_at = now(),
      locked_by = auth.uid(),
      status = 'approved'
  where id = p_minutes_id
  returning * into v_row;

  update meetings set status = 'approved' where id = v_meeting.id;

  perform log_audit('minutes_locked',
                    'Approved and locked: ' || coalesce(v_row.document_title, v_meeting.title));

  if v_meeting.secretary_id is not null and v_meeting.secretary_id <> auth.uid() then
    perform notify_user(v_meeting.secretary_id, 'approval', 'Minutes approved',
                        coalesce(v_row.document_title, v_meeting.title) ||
                        ' has been approved and locked.');
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Amend a locked document.
--
-- The whole point of this being one function: editing approved minutes must
-- invalidate the approving signature. Doing it in five client round-trips
-- leaves windows where the document is signed but edited, or unlocked but still
-- marked approved. Port of amendMinutes() from assets/js/store.js.
-- ---------------------------------------------------------------------------
create or replace function amend_minutes(p_minutes_id uuid, p_summary text default null)
returns minutes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row minutes;
  v_meeting meetings;
  v_name text;
  v_amendment jsonb;
  v_kept jsonb;
begin
  select * into v_meeting
  from meetings
  where id = (select meeting_id from minutes where id = p_minutes_id);

  if v_meeting.id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not sm_can_edit_meeting_docs(v_meeting.id) then
    raise exception 'Not permitted to amend these minutes';
  end if;

  select name into v_name from profiles where id = auth.uid();

  v_amendment := jsonb_build_object(
    'ts', (extract(epoch from now()) * 1000)::bigint,
    'byUserId', auth.uid(),
    'byName', coalesce(v_name, 'Anonymous'),
    'summary', coalesce(nullif(btrim(p_summary), ''), 'Minutes amended after lock')
  );

  -- Drop the approving signature; the secretary's own signature survives.
  select coalesce(jsonb_agg(sig), '[]'::jsonb)
    into v_kept
  from jsonb_array_elements((select signatures from minutes where id = p_minutes_id)) sig
  where coalesce(sig ->> 'role', '') !~* '(dean|chair|head|president)';

  update minutes
  set signatures = v_kept,
      locked_at = null,
      locked_by = null,
      status = 'pending_approval',
      amendments = amendments || jsonb_build_array(v_amendment)
  where id = p_minutes_id
  returning * into v_row;

  update meetings set status = 'pending_approval' where id = v_meeting.id;

  perform log_audit('minutes_amended',
                    'Amended after lock: ' || coalesce(v_row.document_title, v_meeting.title));

  if v_meeting.chair_id is not null then
    perform notify_user(v_meeting.chair_id, 'approval', 'Minutes require re-approval',
                        coalesce(v_row.document_title, v_meeting.title) ||
                        ' was amended after approval and needs your signature again.');
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Record a signature on the minutes.
--
-- Appending to the signatures array is the same column-level problem as
-- comments: a head must be able to sign without being able to rewrite the
-- document body.
-- ---------------------------------------------------------------------------
create or replace function sign_minutes(
  p_minutes_id uuid,
  p_role_label text,
  p_data_url text default null
)
returns minutes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row minutes;
  v_meeting_id uuid;
  v_name text;
  v_sig jsonb;
  v_kept jsonb;
begin
  select meeting_id into v_meeting_id from minutes where id = p_minutes_id;
  if v_meeting_id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not sm_can_edit_meeting_docs(v_meeting_id) then
    raise exception 'Not permitted to sign these minutes';
  end if;

  select name into v_name from profiles where id = auth.uid();

  v_sig := jsonb_build_object(
    'userId', auth.uid(),
    'name', coalesce(v_name, 'Unknown'),
    'role', p_role_label,
    'signedAt', (extract(epoch from now()) * 1000)::bigint,
    'dataUrl', coalesce(p_data_url, '')
  );

  -- Re-signing replaces the previous signature from the same user.
  select coalesce(jsonb_agg(sig), '[]'::jsonb)
    into v_kept
  from jsonb_array_elements((select signatures from minutes where id = p_minutes_id)) sig
  where coalesce(sig ->> 'userId', '') <> auth.uid()::text;

  update minutes
  set signatures = v_kept || jsonb_build_array(v_sig)
  where id = p_minutes_id
  returning * into v_row;

  perform log_audit('minutes_signed', p_role_label || ' signed minutes ' || p_minutes_id);

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Route a draft for approval.
-- ---------------------------------------------------------------------------
create or replace function route_minutes_for_approval(p_minutes_id uuid)
returns minutes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row minutes;
  v_meeting meetings;
begin
  select * into v_meeting
  from meetings
  where id = (select meeting_id from minutes where id = p_minutes_id);

  if v_meeting.id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not sm_can_edit_meeting_docs(v_meeting.id) then
    raise exception 'Not permitted to route these minutes';
  end if;

  update minutes set status = 'pending_approval' where id = p_minutes_id returning * into v_row;
  update meetings set status = 'pending_approval' where id = v_meeting.id;

  perform log_audit('minutes_routed',
                    'Routed for approval: ' || coalesce(v_row.document_title, v_meeting.title));

  if v_meeting.chair_id is not null then
    perform notify_user(v_meeting.chair_id, 'approval', 'Minutes awaiting your signature',
                        coalesce(v_row.document_title, v_meeting.title) ||
                        ' is ready for review.');
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. RLS still applies to every one of these; the definer rights only
-- cover the specific writes each function performs.
-- ---------------------------------------------------------------------------
grant execute on function sm_role() to authenticated;
grant execute on function sm_department() to authenticated;
grant execute on function sm_is_admin() to authenticated;
grant execute on function sm_uuid_or_null(text) to authenticated;
grant execute on function sm_is_participant(uuid) to authenticated;
grant execute on function sm_shares_meeting_with(uuid) to authenticated;
grant execute on function sm_can_see_meeting(uuid) to authenticated;
grant execute on function sm_can_edit_meeting_docs(uuid) to authenticated;
grant execute on function log_audit(text, text) to authenticated;
grant execute on function notify_user(uuid, text, text, text) to authenticated;
grant execute on function append_transcript_comment(uuid, text) to authenticated;
grant execute on function append_minutes_comment(uuid, text) to authenticated;
grant execute on function lock_minutes(uuid) to authenticated;
grant execute on function amend_minutes(uuid, text) to authenticated;
grant execute on function sign_minutes(uuid, text, text) to authenticated;
grant execute on function route_minutes_for_approval(uuid) to authenticated;

-- ==========================================================================
-- END 0003_functions.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0004_storage.sql
-- ==========================================================================

-- ============================================================================
-- Storage buckets
--
-- meeting-audio : private. Recordings are institutional records; nothing here
--                 is world-readable, and access follows meeting visibility.
-- avatars       : private. Profile photos were base64 data URLs in
--                 localStorage; they become objects keyed by user id.
--
-- Object paths carry the authorisation data:
--   meeting-audio/<meeting_id>/<audio_id>.webm
--   avatars/<user_id>/<filename>
-- so storage.foldername(name)[1] identifies the meeting (or user) to check.
--
-- The policies deliberately key off that path rather than storage.objects.owner:
-- the owner column has changed shape across Supabase releases (owner uuid vs
-- owner_id text), and path-based checks also give the right answer for a
-- colleague who did not personally upload the file but can see the meeting.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'meeting-audio',
    'meeting-audio',
    false,
    524288000, -- 500 MB; a 3-hour hybrid meeting at 128kbps is ~170 MB
    array['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a']
  ),
  (
    'avatars',
    'avatars',
    false,
    5242880, -- 5 MB; the UI downscales to 384px before upload
    array['image/png', 'image/jpeg', 'image/webp']
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- meeting-audio
-- ---------------------------------------------------------------------------
create policy "meeting audio readable with the meeting"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'meeting-audio'
    and sm_can_see_meeting(sm_uuid_or_null((storage.foldername(name))[1]))
  );

create policy "meeting audio written by minute takers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meeting-audio'
    and sm_can_edit_meeting_docs(sm_uuid_or_null((storage.foldername(name))[1]))
  );

create policy "meeting audio updated by minute takers"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'meeting-audio'
    and sm_can_edit_meeting_docs(sm_uuid_or_null((storage.foldername(name))[1]))
  );

create policy "meeting audio deleted by minute takers"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'meeting-audio'
    and sm_can_edit_meeting_docs(sm_uuid_or_null((storage.foldername(name))[1]))
  );

-- ---------------------------------------------------------------------------
-- avatars
--
-- Readable by any signed-in user so participant lists and comment threads can
-- render faces; writable only within your own folder.
-- ---------------------------------------------------------------------------
create policy "avatars readable when signed in"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

create policy "avatars written by owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars updated by owner"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars deleted by owner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or sm_is_admin())
  );

-- ==========================================================================
-- END 0004_storage.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0005_reference_data.sql
-- ==========================================================================

-- ============================================================================
-- Reference data
--
-- Departments, meeting sub-types and the settings row: everything that has no
-- dependency on a user id. Demo accounts and their meetings/transcripts/minutes
-- come from scripts/seed-demo.mjs, which has to create auth users first.
--
-- Written to be idempotent so re-running a migration is harmless.
-- ============================================================================

insert into departments (name, short, type, office_location) values
  ('College of Information & Computing Sciences', 'CICS', 'college', 'Bldg A, 4F'),
  ('College of Engineering & Technology',         'CET',  'college', 'Bldg B, 2F'),
  ('College of Business Administration',          'CBA',  'college', 'Bldg C, 3F'),
  ('College of Teacher Education',                'CTE',  'college', 'Bldg D, 1F'),
  ('College of Education',                        'COE',  'college', 'Bldg D, 2F'),
  ('ICT Management Office',                       'ICT',  'office',  'Admin Bldg, GF'),
  ('Office of Academic Affairs',                  'OAA',  'office',  'Admin Bldg, 2F'),
  ('Office of the University President',          'OUP',  'office',  'Admin Bldg, 3F')
on conflict (short) do nothing;

-- Capstone and research defence stages, in the order the UI lists them.
insert into meeting_subtypes (meeting_type, label, position) values
  ('capstone', 'Title Proposal',     1),
  ('capstone', 'Pre-Oral',           2),
  ('capstone', 'Mock Defense',       3),
  ('capstone', 'Final Presentation', 4),
  ('capstone', 'Other',              5),
  ('research', 'Proposal',           1),
  ('research', 'Progress',           2),
  ('research', 'Final',              3)
on conflict (meeting_type, label) do nothing;

-- Single settings row.
--
-- local_processing_only defaults to false now: summarisation runs against the
-- Claude API, so the legacy "no data leaves the device" badge would be a false
-- claim. Transcription is still in-browser via the Web Speech API, and the
-- offline fallback summariser is fully local.
insert into app_settings (id) values (true)
on conflict (id) do nothing;

-- ==========================================================================
-- END 0005_reference_data.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0006_profile_privilege_guard.sql
-- ==========================================================================

-- ============================================================================
-- Close a privilege-escalation hole in profiles.
--
-- ## The bug
--
-- profiles_update_self authorises the ROW ("id = auth.uid()") but says nothing
-- about which COLUMNS may change, and RLS cannot express column-level rules.
-- So any signed-in user could run:
--
--   update profiles set role = 'admin' where id = auth.uid();
--
-- and promote themselves. That is not a cosmetic issue: sm_is_admin() then
-- returns true, which unlocks every meeting in the university, the full audit
-- log, and user management. The same call could also null out department_id to
-- slip out of departmental scoping, or flip `active` back on after an admin
-- deactivated the account.
--
-- Caught by scripts/verify-rls.mjs, which queries as a real faculty session.
-- No UI review would have found it — the profile page never renders a role
-- field, but the table was reachable directly with the publishable key.
--
-- ## The fix
--
-- A BEFORE UPDATE trigger, which is the right tool for per-column authorisation.
-- Column-level GRANTs cannot work here because admins are also `authenticated`,
-- so a REVOKE would lock them out too.
-- ============================================================================

create or replace function guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  /*
   * auth.uid() is null for the service-role key and for direct psql
   * connections — that is the seed script and migrations, which legitimately
   * assign roles. Anonymous requests never reach here: every profiles policy
   * requires `authenticated`.
   */
  if auth.uid() is null or sm_is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only an administrator can change a user role'
      using errcode = '42501';
  end if;

  if new.department_id is distinct from old.department_id then
    raise exception 'Only an administrator can reassign a department'
      using errcode = '42501';
  end if;

  if new.active is distinct from old.active then
    raise exception 'Only an administrator can activate or deactivate an account'
      using errcode = '42501';
  end if;

  -- Identity columns are owned by Supabase Auth, not by this table.
  if new.id is distinct from old.id then
    raise exception 'Profile id is immutable' using errcode = '42501';
  end if;

  if new.email is distinct from old.email then
    raise exception 'Change your email through account settings, not the profile row'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileges
  before update on profiles
  for each row execute function guard_profile_privileges();

-- ==========================================================================
-- END 0006_profile_privilege_guard.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0007_privacy.sql
-- ==========================================================================

-- ============================================================================
-- Privacy and data-processing disclosure
--
-- app_settings.local_processing_only already defaulted to false — the schema
-- never claimed on-device-only processing, even though the legacy UI badge
-- did. This adds the field Admin -> Settings needs to surface an honest,
-- editable processor disclosure instead of a hard-coded claim.
-- See README.md "Privacy & compliance" for the corresponding text fix.
-- ============================================================================

alter table app_settings
  add column data_processing_notice text not null default
    'Audio recordings are uploaded to Supabase Storage and sent to ElevenLabs for transcription. Transcripts are sent to Anthropic (Claude) to draft summaries, action items, and minutes. All three processors operate under data-processing terms; no recording is processed on-device only. Consult the ZPPSU Data Protection Officer before recording an official meeting.';

-- ==========================================================================
-- END 0007_privacy.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0008_transcription.sql
-- ==========================================================================

-- ============================================================================
-- Transcription job tracking
--
-- Provider-agnostic: transcription_jobs records what we asked an ASR provider
-- to do and what came back, independent of which provider (ElevenLabs today,
-- AssemblyAI as a registered fallback — see src/lib/asr/). raw_response is
-- kept so a folding bug can be fixed and replayed without re-billing the
-- provider. transcript_speakers maps a diarized speaker_0/speaker_1 label to
-- a real person once a secretary assigns it.
-- ============================================================================

create type transcription_status as enum (
  'queued', 'uploading', 'processing', 'completed', 'failed', 'cancelled'
);

create table transcription_jobs (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  audio_id uuid not null references audio_recordings (id) on delete cascade,

  provider text not null default 'elevenlabs',
  provider_job_id text,               -- ElevenLabs transcription id
  model text,                          -- 'scribe_v2'

  requested_language text,             -- 'fil' | 'ceb' | 'eng' | null = auto
  detected_language text,
  language_probability numeric(4,3),
  diarize boolean not null default true,
  keyterms text[] not null default '{}',

  status transcription_status not null default 'queued',
  error_code text,
  error_detail text,
  attempts integer not null default 0,

  raw_response jsonb,                  -- keep for re-folding without re-billing
  transcript_id uuid references transcripts (id) on delete set null,

  audio_duration_sec integer,
  cost_usd numeric(10,4),

  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint transcription_jobs_error_consistent
    check (status <> 'failed' or error_code is not null)
);

create index transcription_jobs_meeting_idx on transcription_jobs (meeting_id);
create unique index transcription_jobs_provider_job_idx
  on transcription_jobs (provider, provider_job_id)
  where provider_job_id is not null;
create index transcription_jobs_status_idx on transcription_jobs (status)
  where status in ('queued', 'processing');

create trigger transcription_jobs_set_updated_at
  before update on transcription_jobs
  for each row execute function set_updated_at();

-- Diarization emits speaker_0, speaker_1... Humans map them to real people.
create table transcript_speakers (
  transcript_id uuid not null references transcripts (id) on delete cascade,
  speaker_label text not null,         -- 'speaker_0'
  profile_id uuid references profiles (id) on delete set null,
  display_name text not null,          -- editable; falls back to 'Speaker 1'
  primary key (transcript_id, speaker_label)
);

alter table transcripts
  add column provider text,
  add column detected_language text,
  add column diarized boolean not null default false;

-- ==========================================================================
-- END 0008_transcription.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0009_transcription_rls.sql
-- ==========================================================================

-- ============================================================================
-- RLS for transcription_jobs and transcript_speakers
--
-- Same scoping as transcripts/minutes: visible to whoever can see the
-- meeting, writable by whoever can edit that meeting's documents (secretary,
-- chair, department head/secretary, admin). The webhook that actually
-- populates these rows (src/app/api/webhooks/elevenlabs) runs as ElevenLabs
-- calling us with no Supabase session, so it uses the service-role client and
-- bypasses RLS by design — these policies govern the authenticated app UI,
-- not the webhook.
-- ============================================================================

alter table transcription_jobs enable row level security;
alter table transcript_speakers enable row level security;

create policy transcription_jobs_select on transcription_jobs
  for select to authenticated using (
    created_by = auth.uid()
    or sm_can_see_meeting(meeting_id)
  );

create policy transcription_jobs_insert on transcription_jobs
  for insert to authenticated with check (
    created_by = auth.uid() and sm_can_edit_meeting_docs(meeting_id)
  );

create policy transcription_jobs_update on transcription_jobs
  for update to authenticated
  using (sm_can_edit_meeting_docs(meeting_id) or sm_is_admin())
  with check (sm_can_edit_meeting_docs(meeting_id) or sm_is_admin());

create policy transcription_jobs_delete on transcription_jobs
  for delete to authenticated using (sm_is_admin());

-- transcript_speakers — visible/editable with the parent transcript's meeting.
create policy transcript_speakers_select on transcript_speakers
  for select to authenticated using (
    exists (
      select 1 from transcripts t
      where t.id = transcript_speakers.transcript_id
        and sm_can_see_meeting(t.meeting_id)
    )
  );

create policy transcript_speakers_write on transcript_speakers
  for all to authenticated
  using (
    exists (
      select 1 from transcripts t
      where t.id = transcript_speakers.transcript_id
        and sm_can_edit_meeting_docs(t.meeting_id)
    )
  )
  with check (
    exists (
      select 1 from transcripts t
      where t.id = transcript_speakers.transcript_id
        and sm_can_edit_meeting_docs(t.meeting_id)
    )
  );

-- ==========================================================================
-- END 0009_transcription_rls.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0010_minutes_ai_action_items.sql
-- ==========================================================================

-- ============================================================================
-- Staging column for AI-extracted action items.
--
-- Claude's action-item extraction returns free-text assignee names and
-- relative deadlines ("by next Thursday") — tasks.assignee_id is a uuid and
-- tasks.deadline is a date, so these can't be inserted as task rows without
-- fabricating a name match or parsing a relative date, either of which is a
-- real risk on a governance record. Stage the raw extraction here instead;
-- a secretary resolves each item to a real assignee/deadline before it
-- becomes a tasks row (see src/lib/types/domain.ts's ExtractedActionItem
-- comment: "before it becomes a task row"). UI for that resolution step is
-- Phase 6, not part of this migration.
-- ============================================================================

alter table minutes
  add column ai_action_items jsonb not null default '[]'::jsonb;

-- ==========================================================================
-- END 0010_minutes_ai_action_items.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0011_amend_minutes_body.sql
-- ==========================================================================

-- ============================================================================
-- amend_minutes() must also carry the edited document body.
--
-- minutes_update's RLS policy (0002_rls.sql) requires locked_at is null, so a
-- plain client-side `.update()` on a locked document is silently accepted by
-- PostgREST (0 rows matched, no error surfaced without .select()) but writes
-- nothing. The mom-editor "amend" flow saves the edited call_to_order /
-- previous_minutes / agenda_items / adjournment via a direct table update
-- before calling amend_minutes() to clear the lock - on a locked document
-- that save silently no-ops and the edits are lost. Folding the body write
-- into this SECURITY DEFINER function (same trick lock_minutes/sign_minutes
-- already use to touch a locked row) makes the whole amend a single atomic,
-- successful write.
-- ============================================================================

-- Adding parameters changes the function's identity (name + arg types), so
-- CREATE OR REPLACE would leave the old 2-arg overload behind rather than
-- replacing it. Drop it explicitly first.
drop function if exists amend_minutes(uuid, text);

create or replace function amend_minutes(
  p_minutes_id uuid,
  p_summary text default null,
  p_call_to_order text default null,
  p_previous_minutes text default null,
  p_agenda_items jsonb default null,
  p_adjournment text default null
)
returns minutes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row minutes;
  v_meeting meetings;
  v_name text;
  v_amendment jsonb;
  v_kept jsonb;
begin
  select * into v_meeting
  from meetings
  where id = (select meeting_id from minutes where id = p_minutes_id);

  if v_meeting.id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not sm_can_edit_meeting_docs(v_meeting.id) then
    raise exception 'Not permitted to amend these minutes';
  end if;

  select name into v_name from profiles where id = auth.uid();

  v_amendment := jsonb_build_object(
    'ts', (extract(epoch from now()) * 1000)::bigint,
    'byUserId', auth.uid(),
    'byName', coalesce(v_name, 'Anonymous'),
    'summary', coalesce(nullif(btrim(p_summary), ''), 'Minutes amended after lock')
  );

  -- Drop the approving signature; the secretary's own signature survives.
  select coalesce(jsonb_agg(sig), '[]'::jsonb)
    into v_kept
  from jsonb_array_elements((select signatures from minutes where id = p_minutes_id)) sig
  where coalesce(sig ->> 'role', '') !~* '(dean|chair|head|president)';

  update minutes
  set signatures = v_kept,
      locked_at = null,
      locked_by = null,
      status = 'pending_approval',
      amendments = amendments || jsonb_build_array(v_amendment),
      call_to_order = coalesce(p_call_to_order, call_to_order),
      previous_minutes = coalesce(p_previous_minutes, previous_minutes),
      agenda_items = coalesce(p_agenda_items, agenda_items),
      adjournment = coalesce(p_adjournment, adjournment)
  where id = p_minutes_id
  returning * into v_row;

  update meetings set status = 'pending_approval' where id = v_meeting.id;

  perform log_audit('minutes_amended',
                    'Amended after lock: ' || coalesce(v_row.document_title, v_meeting.title));

  if v_meeting.chair_id is not null then
    perform notify_user(v_meeting.chair_id, 'approval', 'Minutes require re-approval',
                        coalesce(v_row.document_title, v_meeting.title) ||
                        ' was amended after approval and needs your signature again.');
  end if;

  return v_row;
end;
$$;

grant execute on function amend_minutes(uuid, text, text, text, jsonb, text) to authenticated;

-- ==========================================================================
-- END 0011_amend_minutes_body.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0011_smartmin_app_fields.sql
-- ==========================================================================

-- ============================================================================
-- Additive fields for the SmartMin app UI (main working tree).
--
-- The 0001-0010 schema covers the core governance model. The 33-page UI on
-- `main` also uses a few fields that were never modelled: Phase 2 key
-- decisions, Phase 3 signed attendance capture, Phase 4 handwritten panel
-- notes, Phase 5 document translation, and the minutes' explicit action-item
-- task references. All additive — no existing table or column is altered.
-- ============================================================================

-- Phase 2 — AI-extracted key decisions on a transcript.
alter table transcripts
  add column if not exists key_decisions text[] not null default '{}';

-- Minutes: explicit action-item task ids, handwritten notes, translation state.
alter table minutes
  add column if not exists action_items text[] not null default '{}';
alter table minutes
  add column if not exists paper_notes jsonb not null default '[]'::jsonb;
alter table minutes
  add column if not exists translated_to text;

-- Phase 3 — attendance capture with per-attendee signatures.
-- records: [{ userId, name, role, department, present, signatureDataUrl, signedAt }]
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null unique references meetings (id) on delete cascade,
  started_at bigint,
  records jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attendance_meeting_idx on attendance (meeting_id);

drop trigger if exists attendance_set_updated_at on attendance;
create trigger attendance_set_updated_at
  before update on attendance
  for each row execute function set_updated_at();

alter table attendance enable row level security;

-- Visible with the meeting; written by whoever may edit its documents
-- (secretary / chair / dept head / admin) — same rule as transcripts/minutes.
drop policy if exists attendance_select on attendance;
create policy attendance_select on attendance
  for select to authenticated using (sm_can_see_meeting(meeting_id));

drop policy if exists attendance_write on attendance;
create policy attendance_write on attendance
  for all to authenticated
  using (sm_can_edit_meeting_docs(meeting_id))
  with check (sm_can_edit_meeting_docs(meeting_id));

grant select, insert, update, delete on attendance to authenticated, service_role;

-- ==========================================================================
-- END 0011_smartmin_app_fields.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0012_meeting_rsvps.sql
-- ==========================================================================

-- Phase 5 — participant RSVP on a meeting (accept/decline an invitation).
-- Faculty cannot UPDATE meetings under RLS, so RSVP goes through a SECURITY
-- DEFINER function gated on meeting visibility, like the comment RPCs.

alter table meetings add column if not exists rsvps jsonb not null default '{}'::jsonb;

create or replace function set_meeting_rsvp(p_meeting_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_status not in ('accepted', 'declined', 'invited') then
    raise exception 'Invalid RSVP status: %', p_status;
  end if;
  if not sm_can_see_meeting(p_meeting_id) then
    raise exception 'Not permitted to RSVP to this meeting';
  end if;

  update meetings
  set rsvps = coalesce(rsvps, '{}'::jsonb) || jsonb_build_object(auth.uid()::text, p_status)
  where id = p_meeting_id
  returning rsvps into v_result;

  return v_result;
end;
$$;

grant execute on function set_meeting_rsvp(uuid, text) to authenticated;

-- ==========================================================================
-- END 0012_meeting_rsvps.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0013_governance_extras.sql
-- ==========================================================================

-- Governance extras for the app UI:
--   minutes.versions : snapshot history (versioning / diff, rec #13)
--   minutes.motions  : motions + roll-call vote tallies (rec #8)
-- Both additive jsonb; nothing existing is altered.

alter table minutes
  add column if not exists versions jsonb not null default '[]'::jsonb;
alter table minutes
  add column if not exists motions jsonb not null default '[]'::jsonb;

-- ==========================================================================
-- END 0013_governance_extras.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0014_realtime.sql
-- ==========================================================================

-- Enable Supabase Realtime for notifications so the topbar bell updates live
-- (rec #2). RLS still applies to realtime, so users only receive their own rows.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     )
  then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ==========================================================================
-- END 0014_realtime.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0015_security_hardening.sql
-- ==========================================================================

-- ============================================================================
-- 0015 — Security hardening.
--
-- Closes holes found in the Oct 2026 baseline audit:
--
--   1. Self-registration privilege escalation. handle_new_user() copied `role`
--      and `active` straight from client-supplied sign-up metadata, so anyone
--      could sign up as an active admin with the publishable key.
--   2. profiles.active was never enforced server-side. An inactive ("pending")
--      admin was already a full admin under RLS.
--   3. Forgeable approvals. minutes_update let any editor rewrite signatures,
--      status and lock columns directly; sign_minutes() trusted a caller-chosen
--      role label and signed locked documents.
--   4. Every function was executable by `anon` (Supabase's default grants were
--      never revoked), and notify_user() let any signed-in user notify anyone
--      with any text.
--   5. schema_migrations had no RLS.
--
-- Guard triggers below key off `current_user`: a direct PostgREST write runs as
-- `authenticated`, while the workflow RPCs are SECURITY DEFINER and run as their
-- owner, and the webhook/seed run as `service_role`. So the guards stop forged
-- client writes without getting in the way of the sanctioned paths.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 5. Migration bookkeeping is nobody's business but the migrator's.
-- ---------------------------------------------------------------------------
alter table if exists public.schema_migrations enable row level security;
revoke all on table public.schema_migrations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Active-aware caller identity.
--
-- An inactive account resolves to no role and no department, so every policy
-- built on these helpers denies it. Rows keyed on auth.uid() alone (own profile,
-- own notifications) stay readable so the UI can explain "pending approval".
-- ---------------------------------------------------------------------------
create or replace function sm_is_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select active from profiles where id = auth.uid()), false);
$$;

create or replace function sm_role()
returns user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from profiles where id = auth.uid() and active;
$$;

create or replace function sm_department()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select department_id from profiles where id = auth.uid() and active;
$$;

create or replace function sm_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select role from profiles where id = auth.uid() and active) = 'admin', false);
$$;

-- Editing rights now also require an active account (an inactive secretary
-- would otherwise still pass through m.secretary_id = auth.uid()).
create or replace function sm_can_edit_meeting_docs(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sm_is_active() and exists (
    select 1
    from meetings m
    where m.id = p_meeting_id
      and (
        sm_is_admin()
        or m.secretary_id = auth.uid()
        or m.chair_id = auth.uid()
        or (sm_role() in ('head', 'secretary') and m.department_id = sm_department())
      )
  );
$$;

-- The approving head of a department: departments.head_id when that account is
-- active, otherwise the first active head-role profile in the department.
create or replace function sm_department_head(p_department_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select d.head_id
       from departments d
       join profiles p on p.id = d.head_id and p.active
      where d.id = p_department_id),
    (select p.id
       from profiles p
      where p.department_id = p_department_id and p.role = 'head' and p.active
      order by p.created_at
      limit 1)
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. Sign-ups are always pending faculty. The requested role is recorded for an
--    administrator to review; it grants nothing by itself.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists requested_role user_role;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw text := nullif(new.raw_user_meta_data ->> 'department_id', '');
  v_requested text := new.raw_user_meta_data ->> 'role';
  v_dept uuid;
begin
  if v_raw is not null then
    select id into v_dept
    from departments
    where id = sm_uuid_or_null(v_raw) or short = upper(v_raw)
    limit 1;
  end if;

  insert into profiles (id, name, email, role, requested_role, department_id, position, active, joined_at)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email,
    'faculty',
    case when v_requested in ('admin', 'head', 'secretary', 'faculty')
         then v_requested::user_role end,
    v_dept,
    nullif(new.raw_user_meta_data ->> 'position', ''),
    false,
    current_date
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Role / activation changes are audited by the database, not the client.
create or replace function audit_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role then
    perform log_audit('user_role_changed', new.email || ': ' || old.role || ' -> ' || new.role);
  end if;
  if new.active is distinct from old.active then
    perform log_audit(case when new.active then 'user_activated' else 'user_deactivated' end, new.email);
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_audit_privileges on profiles;
create trigger profiles_audit_privileges
  after update of role, active on profiles
  for each row execute function audit_profile_privileges();

-- Departments for the signed-out register form, without exposing the table.
create or replace function list_departments_public()
returns table (id uuid, name text, short text, type department_type)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.name, d.short, d.type from departments d order by d.type, d.name;
$$;

-- ---------------------------------------------------------------------------
-- 3a. Minutes: workflow columns are writable only through the RPCs.
-- SECURITY INVOKER on purpose: current_user must reflect who issued the write.
-- ---------------------------------------------------------------------------
create or replace function guard_minutes_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.signatures := '[]'::jsonb;
    new.comments := '[]'::jsonb;
    new.amendments := '[]'::jsonb;
    new.status := 'draft';
    new.locked_at := null;
    new.locked_by := null;
    return new;
  end if;

  if new.signatures is distinct from old.signatures
     or new.status is distinct from old.status
     or new.locked_at is distinct from old.locked_at
     or new.locked_by is distinct from old.locked_by
     or new.amendments is distinct from old.amendments
     or new.comments is distinct from old.comments
     or new.meeting_id is distinct from old.meeting_id then
    raise exception 'Signatures, approval status and comments can only change through the approval workflow'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists minutes_guard_columns on minutes;
create trigger minutes_guard_columns
  before insert or update on minutes
  for each row execute function guard_minutes_columns();

-- Transcript comments carry an author; they go through append_transcript_comment().
create or replace function guard_transcript_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' and new.comments is distinct from old.comments then
    raise exception 'Comments can only be added through append_transcript_comment()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists transcripts_guard_columns on transcripts;
create trigger transcripts_guard_columns
  before update on transcripts
  for each row execute function guard_transcript_columns();

-- ---------------------------------------------------------------------------
-- 3b. Meetings: the approving chair is the department head, and approval status
-- is never set directly.
-- ---------------------------------------------------------------------------
create or replace function guard_meeting_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Every caller (seed included) gets the department head as the approving
  -- chair when none was given — without it, routing/approval notifications go
  -- nowhere and the head's signature never renders.
  if tg_op = 'INSERT' and new.chair_id is null then
    new.chair_id := sm_department_head(new.department_id);
  end if;

  if current_user <> 'authenticated' or sm_is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.department_id is distinct from old.department_id then
      raise exception 'A meeting cannot be moved to another department' using errcode = '42501';
    end if;
    if new.secretary_id is distinct from old.secretary_id and sm_role() is distinct from 'head' then
      raise exception 'Only the department head can reassign the meeting secretary' using errcode = '42501';
    end if;
  elsif new.secretary_id is not null and new.secretary_id <> auth.uid() and sm_role() is distinct from 'head' then
    raise exception 'You can only schedule meetings as their secretary' using errcode = '42501';
  end if;

  if new.chair_id is not null
     and (tg_op = 'INSERT' or new.chair_id is distinct from old.chair_id)
     and new.chair_id is distinct from sm_department_head(new.department_id) then
    raise exception 'The approving chair must be the department head' using errcode = '42501';
  end if;

  if new.status in ('pending_approval', 'approved')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    raise exception 'Approval status changes go through the minutes workflow' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists meetings_guard_columns on meetings;
create trigger meetings_guard_columns
  before insert or update on meetings
  for each row execute function guard_meeting_columns();

-- ---------------------------------------------------------------------------
-- 3c. Signing. The signer's capacity is derived on the server; the caller's
-- label is ignored (kept in the signature only for backward compatibility).
-- ---------------------------------------------------------------------------
create or replace function sign_minutes(
  p_minutes_id uuid,
  p_role_label text,
  p_data_url text default null
)
returns minutes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row minutes;
  v_meeting meetings;
  v_locked timestamptz;
  v_name text;
  v_is_approver boolean;
  v_kind text;
  v_label text;
  v_sig jsonb;
  v_kept jsonb;
begin
  select m.* into v_meeting
  from meetings m
  where m.id = (select meeting_id from minutes where id = p_minutes_id);

  if v_meeting.id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not sm_can_edit_meeting_docs(v_meeting.id) then
    raise exception 'Not permitted to sign these minutes' using errcode = '42501';
  end if;

  select locked_at into v_locked from minutes where id = p_minutes_id;
  if v_locked is not null then
    raise exception 'These minutes are locked. Amend them before signing again.' using errcode = '42501';
  end if;

  if p_data_url is not null and p_data_url <> ''
     and (p_data_url !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(p_data_url) > 400000) then
    raise exception 'Signature must be a PNG image under 300 KB' using errcode = '22023';
  end if;

  v_is_approver := sm_is_admin()
    or v_meeting.chair_id = auth.uid()
    or (sm_role() = 'head' and v_meeting.department_id = sm_department());
  v_kind := case when v_is_approver then 'approver' else 'secretary' end;
  v_label := case
    when v_is_approver and sm_role() = 'admin' and v_meeting.chair_id is distinct from auth.uid() then 'Administrator'
    when v_is_approver then 'Head'
    else 'Faculty Secretary'
  end;

  select name into v_name from profiles where id = auth.uid();

  v_sig := jsonb_build_object(
    'userId', auth.uid(),
    'name', coalesce(v_name, 'Unknown'),
    'role', v_label,
    'kind', v_kind,
    'signedAt', (extract(epoch from now()) * 1000)::bigint,
    'dataUrl', coalesce(p_data_url, '')
  );

  select coalesce(jsonb_agg(sig), '[]'::jsonb)
    into v_kept
  from jsonb_array_elements((select signatures from minutes where id = p_minutes_id)) sig
  where coalesce(sig ->> 'userId', '') <> auth.uid()::text;

  update minutes
  set signatures = v_kept || jsonb_build_array(v_sig)
  where id = p_minutes_id
  returning * into v_row;

  perform log_audit('minutes_signed', v_label || ' signed minutes ' || p_minutes_id);

  return v_row;
end;
$$;

-- Sign as approver and lock in one transaction, so a signed document is never
-- left unlocked (ApprovalsList used to do this in two client round-trips).
create or replace function approve_minutes(p_minutes_id uuid, p_data_url text)
returns minutes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meeting meetings;
begin
  select m.* into v_meeting
  from meetings m
  where m.id = (select meeting_id from minutes where id = p_minutes_id);

  if v_meeting.id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not (
    sm_is_admin()
    or v_meeting.chair_id = auth.uid()
    or (sm_role() = 'head' and v_meeting.department_id = sm_department())
  ) then
    raise exception 'Only the department head or an administrator can approve these minutes'
      using errcode = '42501';
  end if;

  perform sign_minutes(p_minutes_id, 'Head', p_data_url);
  return lock_minutes(p_minutes_id);
end;
$$;

-- Amending drops the approver's signature. New signatures carry kind='approver';
-- older rows only have a role label, matched as before.
drop function if exists amend_minutes(uuid, text);

create or replace function amend_minutes(
  p_minutes_id uuid,
  p_summary text default null,
  p_call_to_order text default null,
  p_previous_minutes text default null,
  p_agenda_items jsonb default null,
  p_adjournment text default null
)
returns minutes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row minutes;
  v_meeting meetings;
  v_name text;
  v_amendment jsonb;
  v_kept jsonb;
begin
  select * into v_meeting
  from meetings
  where id = (select meeting_id from minutes where id = p_minutes_id);

  if v_meeting.id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not sm_can_edit_meeting_docs(v_meeting.id) then
    raise exception 'Not permitted to amend these minutes' using errcode = '42501';
  end if;

  select name into v_name from profiles where id = auth.uid();

  v_amendment := jsonb_build_object(
    'ts', (extract(epoch from now()) * 1000)::bigint,
    'byUserId', auth.uid(),
    'byName', coalesce(v_name, 'Anonymous'),
    'summary', coalesce(nullif(btrim(p_summary), ''), 'Minutes amended after lock')
  );

  select coalesce(jsonb_agg(sig), '[]'::jsonb)
    into v_kept
  from jsonb_array_elements((select signatures from minutes where id = p_minutes_id)) sig
  where coalesce(sig ->> 'kind', '') <> 'approver'
    and (sig ? 'kind' or coalesce(sig ->> 'role', '') !~* '(dean|chair|head|president|administrator)');

  update minutes
  set signatures = v_kept,
      locked_at = null,
      locked_by = null,
      status = 'pending_approval',
      amendments = amendments || jsonb_build_array(v_amendment),
      call_to_order = coalesce(p_call_to_order, call_to_order),
      previous_minutes = coalesce(p_previous_minutes, previous_minutes),
      agenda_items = coalesce(p_agenda_items, agenda_items),
      adjournment = coalesce(p_adjournment, adjournment)
  where id = p_minutes_id
  returning * into v_row;

  update meetings set status = 'pending_approval' where id = v_meeting.id;

  perform log_audit('minutes_amended',
                    'Amended after lock: ' || coalesce(v_row.document_title, v_meeting.title));

  if v_meeting.chair_id is not null then
    perform notify_user(v_meeting.chair_id, 'approval', 'Minutes require re-approval',
                        coalesce(v_row.document_title, v_meeting.title) ||
                        ' was amended after approval and needs your signature again.');
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Function privileges.
--
-- Supabase grants EXECUTE on every new public function to anon. Take that away
-- wholesale, then keep `authenticated` only on what the app calls (its default
-- grant stays in place for the RLS helpers policies evaluate). notify_user and
-- log_audit become internal: the workflow functions call them as owner, and the
-- webhook calls log_audit as service_role.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

revoke execute on function notify_user(uuid, text, text, text) from authenticated;
revoke execute on function log_audit(text, text) from authenticated;
grant execute on function notify_user(uuid, text, text, text) to service_role;
grant execute on function log_audit(text, text) to service_role;

grant execute on function sm_is_active() to authenticated;
grant execute on function sm_department_head(uuid) to authenticated;
grant execute on function sign_minutes(uuid, text, text) to authenticated;
grant execute on function approve_minutes(uuid, text) to authenticated;
grant execute on function amend_minutes(uuid, text, text, text, jsonb, text) to authenticated;
grant execute on function list_departments_public() to anon, authenticated;

notify pgrst, 'reload schema';

-- ==========================================================================
-- END 0015_security_hardening.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0016_meeting_people.sql
-- ==========================================================================

-- ============================================================================
-- 0016 — Meeting people: guests, typed chairperson / panel / adviser,
-- emergency meetings, one visibility rule, participant sync, notifications.
--
-- Client requests (Oct 2026 panel review):
--   * participants without an account can be added by typing their name;
--   * capstone chairperson and panel members are typed (external panelists,
--     other colleges), optionally linked to an account;
--   * unscheduled ("biglaan") emergency meetings alongside scheduled ones;
--   * scheduled meetings notify the people on them.
--
-- The existing chairperson_id / panel_member_ids / adviser_id columns stay as
-- the "linked account" half (the editor, transcribe route and webhook read
-- them); the new name columns are the source of truth for display, and a
-- trigger keeps the two in step.
-- ============================================================================

alter table meetings add column if not exists is_emergency boolean not null default false;
alter table meetings add column if not exists guests jsonb not null default '[]'::jsonb;
alter table meetings add column if not exists chairperson_name text;
alter table meetings add column if not exists panel_members jsonb not null default '[]'::jsonb;
alter table meetings add column if not exists adviser_name text;

alter table meetings drop constraint if exists meetings_guests_is_array;
alter table meetings add constraint meetings_guests_is_array
  check (jsonb_typeof(guests) = 'array' and jsonb_array_length(guests) <= 100);

alter table meetings drop constraint if exists meetings_panel_members_is_array;
alter table meetings add constraint meetings_panel_members_is_array
  check (jsonb_typeof(panel_members) = 'array' and jsonb_array_length(panel_members) <= 12);

alter table meetings drop constraint if exists meetings_people_names_length;
alter table meetings add constraint meetings_people_names_length
  check (coalesce(length(chairperson_name), 0) <= 120 and coalesce(length(adviser_name), 0) <= 120);

-- Notifications can point at the meeting they are about, so the bell can link
-- each recipient to the right page for their role.
alter table notifications add column if not exists meeting_id uuid references meetings (id) on delete cascade;

-- Backfill display names for meetings created before this migration.
update meetings m
set chairperson_name = p.name
from profiles p
where m.chairperson_id = p.id and m.chairperson_name is null;

update meetings m
set adviser_name = p.name
from profiles p
where m.adviser_id = p.id and m.adviser_name is null;

update meetings m
set panel_members = coalesce((
  select jsonb_agg(jsonb_build_object('name', p.name, 'userId', p.id) order by p.name)
  from profiles p
  where p.id = any (m.panel_member_ids)
), '[]'::jsonb)
where cardinality(m.panel_member_ids) > 0 and m.panel_members = '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- One meeting visibility rule, evaluated on the row itself.
--
-- The old sm_can_see_meeting(id) re-read `meetings`, which a STABLE function
-- cannot see during INSERT ... RETURNING (the new row is invisible to its
-- snapshot), and it only let *faculty* see meetings they were invited to — a
-- head or secretary from another college sitting on a capstone panel could
-- not open the meeting at all.
-- ---------------------------------------------------------------------------
create or replace function sm_can_see_meeting_row(
  p_id uuid,
  p_department_id uuid,
  p_secretary_id uuid,
  p_chair_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sm_is_active() and (
    sm_is_admin()
    or p_department_id = sm_department()
    or p_secretary_id = auth.uid()
    or p_chair_id = auth.uid()
    or sm_is_participant(p_id)
  );
$$;

create or replace function sm_can_see_meeting(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from meetings m
    where m.id = p_meeting_id
      and sm_can_see_meeting_row(m.id, m.department_id, m.secretary_id, m.chair_id)
  );
$$;

drop policy if exists meetings_select on meetings;
create policy meetings_select on meetings
  for select to authenticated
  using (sm_can_see_meeting_row(id, department_id, secretary_id, chair_id));

-- ---------------------------------------------------------------------------
-- Keep the linked-account columns in step with the typed people.
-- Also validates the jsonb shapes the UI writes.
-- ---------------------------------------------------------------------------
create or replace function sync_meeting_people()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elem jsonb;
begin
  for v_elem in select * from jsonb_array_elements(new.guests) loop
    if jsonb_typeof(v_elem) <> 'object'
       or coalesce(btrim(v_elem ->> 'name'), '') = ''
       or length(v_elem ->> 'name') > 120 then
      raise exception 'Each guest needs a name (up to 120 characters)' using errcode = '22023';
    end if;
  end loop;

  for v_elem in select * from jsonb_array_elements(new.panel_members) loop
    if jsonb_typeof(v_elem) <> 'object'
       or coalesce(btrim(v_elem ->> 'name'), '') = ''
       or length(v_elem ->> 'name') > 120 then
      raise exception 'Each panel member needs a name (up to 120 characters)' using errcode = '22023';
    end if;
  end loop;

  if jsonb_array_length(new.panel_members) > 0 then
    new.panel_member_ids := coalesce((
      select array_agg(distinct u)
      from (
        select sm_uuid_or_null(e ->> 'userId') as u
        from jsonb_array_elements(new.panel_members) e
      ) x
      where u is not null and exists (select 1 from profiles p where p.id = u)
    ), '{}');
  elsif tg_op = 'UPDATE' and old.panel_members <> '[]'::jsonb then
    new.panel_member_ids := '{}';
  elsif cardinality(new.panel_member_ids) > 0 then
    new.panel_members := coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'userId', p.id) order by p.name)
      from profiles p where p.id = any (new.panel_member_ids)
    ), '[]'::jsonb);
  end if;

  if new.chairperson_id is not null and nullif(btrim(new.chairperson_name), '') is null then
    select name into new.chairperson_name from profiles where id = new.chairperson_id;
  end if;
  if new.adviser_id is not null and nullif(btrim(new.adviser_name), '') is null then
    select name into new.adviser_name from profiles where id = new.adviser_id;
  end if;

  new.chairperson_name := nullif(btrim(new.chairperson_name), '');
  new.adviser_name := nullif(btrim(new.adviser_name), '');
  return new;
end;
$$;

drop trigger if exists meetings_sync_people on meetings;
create trigger meetings_sync_people
  before insert or update on meetings
  for each row execute function sync_meeting_people();

-- Linked accounts in a role (approving chair, panel chair, panel, adviser) are
-- participants: they can see the meeting and they get its notifications.
create or replace function add_meeting_role_participants()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into meeting_participants (meeting_id, user_id)
  select new.id, u
  from unnest(array[new.chair_id, new.chairperson_id, new.adviser_id] || new.panel_member_ids) as u
  where u is not null
  on conflict do nothing;
  return null;
end;
$$;

drop trigger if exists meetings_add_role_participants on meetings;
create trigger meetings_add_role_participants
  after insert or update of chair_id, chairperson_id, adviser_id, panel_member_ids on meetings
  for each row execute function add_meeting_role_participants();

-- ---------------------------------------------------------------------------
-- Notifications. Raised by the database so they cannot be skipped or forged.
-- Skipped when there is no signed-in actor (seed scripts, migrations).
-- ---------------------------------------------------------------------------
create or replace function sm_fmt_meeting_time(p_ts timestamptz)
returns text
language sql
stable
as $$
  select to_char(p_ts at time zone 'Asia/Manila', 'Mon FMDD, YYYY "at" FMHH12:MI AM');
$$;

create or replace function notify_new_participant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m meetings;
begin
  if auth.uid() is null or new.user_id = auth.uid() then
    return null;
  end if;

  select * into v_m from meetings where id = new.meeting_id;
  if v_m.id is null then
    return null;
  end if;

  insert into notifications (user_id, type, title, body, meeting_id)
  values (
    new.user_id,
    'meeting_invite',
    case when v_m.is_emergency then 'Emergency meeting now' else 'You''re invited to a meeting' end,
    v_m.title || ' — ' || sm_fmt_meeting_time(v_m.starts_at) || coalesce(' · ' || nullif(v_m.venue, ''), ''),
    v_m.id
  );
  return null;
end;
$$;

drop trigger if exists meeting_participants_notify on meeting_participants;
create trigger meeting_participants_notify
  after insert on meeting_participants
  for each row execute function notify_new_participant();

create or replace function notify_meeting_rescheduled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  if new.starts_at is not distinct from old.starts_at and new.venue is not distinct from old.venue then
    return null;
  end if;

  insert into notifications (user_id, type, title, body, meeting_id)
  select mp.user_id,
         'meeting_update',
         'Meeting rescheduled',
         new.title || ' — now ' || sm_fmt_meeting_time(new.starts_at) || coalesce(' · ' || nullif(new.venue, ''), ''),
         new.id
  from meeting_participants mp
  where mp.meeting_id = new.id and mp.user_id <> auth.uid();
  return null;
end;
$$;

drop trigger if exists meetings_notify_rescheduled on meetings;
create trigger meetings_notify_rescheduled
  after update of starts_at, venue on meetings
  for each row execute function notify_meeting_rescheduled();

-- ---------------------------------------------------------------------------
-- People search for the chairperson / panel / participant pickers.
-- Cross-department on purpose (external panelists), so it is a definer
-- function returning only directory fields, to staff only, with a minimum
-- query length and a hard row cap.
-- ---------------------------------------------------------------------------
create or replace function search_people(p_query text, p_limit int default 10)
returns table (id uuid, name text, "position" text, role user_role, department_short text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.name, p.position, p.role, d.short
  from profiles p
  left join departments d on d.id = p.department_id
  where sm_role() in ('admin', 'head', 'secretary')
    and p.active
    and length(btrim(coalesce(p_query, ''))) >= 2
    and p.name ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by p.name
  limit least(greatest(coalesce(p_limit, 10), 1), 20);
$$;

revoke execute on function sm_can_see_meeting_row(uuid, uuid, uuid, uuid) from public, anon;
revoke execute on function search_people(text, int) from public, anon;
revoke execute on function sm_fmt_meeting_time(timestamptz) from public, anon;
grant execute on function sm_can_see_meeting_row(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function search_people(text, int) to authenticated;

notify pgrst, 'reload schema';

-- ==========================================================================
-- END 0016_meeting_people.sql
-- ==========================================================================

-- ==========================================================================
-- BEGIN 0017_meeting_attachments.sql
-- ==========================================================================

-- ============================================================================
-- 0017 — Meeting attachments (evidence).
--
-- Client request (Oct 2026): keep "evidence" with each meeting — photos of the
-- paper attendance sheet, pictures, and the photographed handwritten panel
-- notes (the original image must never be lost, only its OCR text kept).
--
-- Objects live in the private `meeting-attachments` bucket under
--   <meeting_id>/<uuid>.<ext>
-- so storage policies authorise on the path, exactly like meeting-audio (0004).
-- ============================================================================

create table if not exists meeting_attachments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  kind text not null default 'evidence'
    check (kind in ('attendance_sheet', 'panel_notes', 'evidence', 'other')),
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 15728640),
  caption text check (caption is null or length(caption) <= 500),
  uploaded_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists meeting_attachments_meeting_idx on meeting_attachments (meeting_id, created_at);

alter table meeting_attachments enable row level security;

drop policy if exists meeting_attachments_select on meeting_attachments;
create policy meeting_attachments_select on meeting_attachments
  for select to authenticated using (sm_can_see_meeting(meeting_id));

drop policy if exists meeting_attachments_insert on meeting_attachments;
create policy meeting_attachments_insert on meeting_attachments
  for insert to authenticated
  with check (sm_can_edit_meeting_docs(meeting_id) and uploaded_by = auth.uid());

drop policy if exists meeting_attachments_delete on meeting_attachments;
create policy meeting_attachments_delete on meeting_attachments
  for delete to authenticated using (sm_can_edit_meeting_docs(meeting_id));

-- No UPDATE policy: an attachment is replaced by deleting and re-uploading.

grant select, insert, delete on meeting_attachments to authenticated;
grant all on meeting_attachments to service_role;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meeting-attachments',
  'meeting-attachments',
  false,
  15728640, -- 15 MB; the UI downscales photos to <= 2000px before upload
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = false;

drop policy if exists "meeting attachments readable with the meeting" on storage.objects;
create policy "meeting attachments readable with the meeting"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'meeting-attachments'
    and sm_can_see_meeting(sm_uuid_or_null((storage.foldername(name))[1]))
  );

drop policy if exists "meeting attachments written by minute takers" on storage.objects;
create policy "meeting attachments written by minute takers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meeting-attachments'
    and sm_can_edit_meeting_docs(sm_uuid_or_null((storage.foldername(name))[1]))
  );

drop policy if exists "meeting attachments deleted by minute takers" on storage.objects;
create policy "meeting attachments deleted by minute takers"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'meeting-attachments'
    and sm_can_edit_meeting_docs(sm_uuid_or_null((storage.foldername(name))[1]))
  );

-- The audio upload route accepts these types, but the bucket rejected them and
-- left recording rows without a file. Align the bucket with the route.
update storage.buckets
set allowed_mime_types = array[
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a',
  'audio/x-wav', 'audio/aac', 'audio/flac'
]
where id = 'meeting-audio';

notify pgrst, 'reload schema';

-- ==========================================================================
-- END 0017_meeting_attachments.sql
-- ==========================================================================

-- ==========================================================================
-- Migration bookkeeping — keeps scripts/db-push.mjs in sync
-- ==========================================================================

create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

insert into schema_migrations (name) values
  ('0001_schema.sql'),
  ('0002_rls.sql'),
  ('0003_functions.sql'),
  ('0004_storage.sql'),
  ('0005_reference_data.sql'),
  ('0006_profile_privilege_guard.sql'),
  ('0007_privacy.sql'),
  ('0008_transcription.sql'),
  ('0009_transcription_rls.sql'),
  ('0010_minutes_ai_action_items.sql'),
  ('0011_amend_minutes_body.sql'),
  ('0011_smartmin_app_fields.sql'),
  ('0012_meeting_rsvps.sql'),
  ('0013_governance_extras.sql'),
  ('0014_realtime.sql'),
  ('0015_security_hardening.sql'),
  ('0016_meeting_people.sql'),
  ('0017_meeting_attachments.sql')
on conflict (name) do nothing;
