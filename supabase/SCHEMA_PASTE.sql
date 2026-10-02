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
  ('0006_profile_privilege_guard.sql')
on conflict (name) do nothing;
