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
