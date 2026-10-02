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
