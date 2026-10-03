-- Rollback for 0018_personal_recordings.sql.
-- Drops the faculty recording columns and bucket policies. Objects already in
-- the personal-audio bucket are NOT deleted here (storage objects must be
-- removed through the Storage API); empty the bucket first if it should go.

drop policy if exists "personal audio readable by owner" on storage.objects;
drop policy if exists "personal audio written by owner" on storage.objects;
drop policy if exists "personal audio updated by owner" on storage.objects;
drop policy if exists "personal audio deleted by owner" on storage.objects;

drop trigger if exists personal_meetings_check_link on personal_meetings;
drop function if exists personal_meetings_check_link();

drop policy if exists personal_meetings_write on personal_meetings;
create policy personal_meetings_write on personal_meetings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop index if exists personal_meetings_meeting_idx;
drop index if exists personal_meetings_user_active_idx;

alter table personal_meetings
  drop column if exists meeting_id,
  drop column if exists status,
  drop column if exists mode,
  drop column if exists location,
  drop column if exists duration_min,
  drop column if exists purpose,
  drop column if exists outcome,
  drop column if exists follow_up_date,
  drop column if exists archived_at,
  drop column if exists audio_path,
  drop column if exists audio_mime,
  drop column if exists audio_size_bytes,
  drop column if exists audio_uploaded_at,
  drop column if exists transcript_status,
  drop column if exists transcript_error,
  drop column if exists transcript_segments,
  drop column if exists transcript_language,
  drop column if exists transcribed_at;

delete from schema_migrations where name = '0018_personal_recordings.sql';

notify pgrst, 'reload schema';
