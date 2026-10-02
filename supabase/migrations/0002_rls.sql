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
