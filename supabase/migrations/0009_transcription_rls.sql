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
