-- ============================================================================
-- 0018 — Faculty personal meetings: richer log, archive, own recordings.
--
-- Client request (Oct 2026): faculty can upload a recorded meeting, keep it
-- (archive) and read its transcript, both for their own advising /
-- consultation sessions and for an institutional meeting they attended.
--
-- Deliberately kept OUT of the institutional workflow: a faculty recording
-- is private to its owner and never becomes the official audio, transcript or
-- minutes of a meeting (those stay with the secretary, RLS 0002/0009/0015).
-- It lives on the owner's personal_meetings row, its audio in the private
-- `personal-audio` bucket under
--   <user_id>/<personal_meeting_id>/<uuid>.<ext>
-- so storage policies authorise on the path's first folder, like avatars.
-- ============================================================================

alter table personal_meetings
  -- optional link to the institutional meeting this entry is about
  add column if not exists meeting_id uuid references meetings (id) on delete set null,
  add column if not exists status text not null default 'done'
    check (status in ('scheduled', 'done', 'cancelled')),
  add column if not exists mode text
    check (mode is null or mode in ('in_person', 'online', 'phone')),
  add column if not exists location text check (location is null or length(location) <= 200),
  add column if not exists duration_min integer check (duration_min is null or duration_min between 1 and 1440),
  add column if not exists purpose text check (purpose is null or length(purpose) <= 2000),
  add column if not exists outcome text check (outcome is null or length(outcome) <= 4000),
  add column if not exists follow_up_date date,
  add column if not exists archived_at timestamptz,

  -- the owner's own recording
  add column if not exists audio_path text,
  add column if not exists audio_mime text,
  add column if not exists audio_size_bytes bigint check (audio_size_bytes is null or audio_size_bytes > 0),
  add column if not exists audio_uploaded_at timestamptz,

  -- its transcript (written by the server after speech-to-text)
  add column if not exists transcript_status text not null default 'none'
    check (transcript_status in ('none', 'processing', 'completed', 'failed')),
  add column if not exists transcript_error text,
  add column if not exists transcript_segments jsonb,
  add column if not exists transcript_language text,
  add column if not exists transcribed_at timestamptz;

create index if not exists personal_meetings_meeting_idx on personal_meetings (meeting_id) where meeting_id is not null;
create index if not exists personal_meetings_user_active_idx on personal_meetings (user_id, meeting_date desc) where archived_at is null;

-- A personal entry may only point at a meeting its owner can actually see —
-- otherwise the link would leak a meeting's existence and title.
create or replace function personal_meetings_check_link()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.meeting_id is not null
     and (tg_op = 'INSERT' or new.meeting_id is distinct from old.meeting_id)
     and auth.uid() is not null
     and not sm_can_see_meeting(new.meeting_id) then
    raise exception 'You can only link a meeting you can see.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists personal_meetings_check_link on personal_meetings;
create trigger personal_meetings_check_link
  before insert or update of meeting_id on personal_meetings
  for each row execute function personal_meetings_check_link();

-- Active accounts only (0015): an inactive owner keeps read access to their
-- log but can no longer write to it.
drop policy if exists personal_meetings_write on personal_meetings;
create policy personal_meetings_write on personal_meetings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and sm_is_active());

-- ---------------------------------------------------------------------------
-- Storage: personal-audio (private, owner-only)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'personal-audio',
  'personal-audio',
  false,
  524288000, -- 500 MB, same as meeting-audio
  array[
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a',
    'audio/x-wav', 'audio/aac', 'audio/flac'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "personal audio readable by owner" on storage.objects;
create policy "personal audio readable by owner"
  on storage.objects for select to authenticated
  using (bucket_id = 'personal-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "personal audio written by owner" on storage.objects;
create policy "personal audio written by owner"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'personal-audio' and (storage.foldername(name))[1] = auth.uid()::text and sm_is_active());

drop policy if exists "personal audio updated by owner" on storage.objects;
create policy "personal audio updated by owner"
  on storage.objects for update to authenticated
  using (bucket_id = 'personal-audio' and (storage.foldername(name))[1] = auth.uid()::text and sm_is_active());

drop policy if exists "personal audio deleted by owner" on storage.objects;
create policy "personal audio deleted by owner"
  on storage.objects for delete to authenticated
  using (bucket_id = 'personal-audio' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
