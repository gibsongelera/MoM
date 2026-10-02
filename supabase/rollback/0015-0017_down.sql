-- ============================================================================
-- Rollback for 0015_security_hardening, 0016_meeting_people,
-- 0017_meeting_attachments.
--
-- Run ONLY if the release must be reverted. Order:
--   1. backups/<stamp>/restore-functions.sql   (from scripts/db-backup.mjs,
--      taken right before db:push) — restores the previous function bodies.
--   2. this file — removes the triggers/functions/policies those migrations
--      added and restores the previous grants.
--   3. delete from schema_migrations where name in
--      ('0015_security_hardening.sql','0016_meeting_people.sql','0017_meeting_attachments.sql');
--
-- Columns and the meeting_attachments table are left in place: they are
-- additive and harmless to the previous code. Drop them separately only if
-- you are sure no data in them is needed.
-- ============================================================================
begin;

drop trigger if exists minutes_guard_columns on minutes;
drop trigger if exists transcripts_guard_columns on transcripts;
drop trigger if exists meetings_guard_columns on meetings;
drop trigger if exists meetings_sync_people on meetings;
drop trigger if exists meetings_add_role_participants on meetings;
drop trigger if exists meetings_notify_rescheduled on meetings;
drop trigger if exists meeting_participants_notify on meeting_participants;
drop trigger if exists profiles_audit_privileges on profiles;

drop policy if exists meetings_select on meetings;
create policy meetings_select on meetings
  for select to authenticated using (sm_can_see_meeting(id));

drop function if exists guard_minutes_columns();
drop function if exists guard_transcript_columns();
drop function if exists guard_meeting_columns();
drop function if exists sync_meeting_people();
drop function if exists add_meeting_role_participants();
drop function if exists notify_new_participant();
drop function if exists notify_meeting_rescheduled();
drop function if exists audit_profile_privileges();
drop function if exists approve_minutes(uuid, text);
drop function if exists search_people(text, int);
drop function if exists list_departments_public();
drop function if exists sm_can_see_meeting_row(uuid, uuid, uuid, uuid);
drop function if exists sm_fmt_meeting_time(timestamptz);
drop function if exists sm_department_head(uuid);
drop function if exists sm_is_active();

-- Previous privilege model (Supabase defaults).
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

alter table if exists public.schema_migrations disable row level security;

notify pgrst, 'reload schema';
commit;
