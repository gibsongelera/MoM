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
