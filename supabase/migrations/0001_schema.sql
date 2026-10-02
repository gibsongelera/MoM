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
