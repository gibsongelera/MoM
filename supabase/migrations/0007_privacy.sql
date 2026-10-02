-- ============================================================================
-- Privacy and data-processing disclosure
--
-- app_settings.local_processing_only already defaulted to false — the schema
-- never claimed on-device-only processing, even though the legacy UI badge
-- did. This adds the field Admin -> Settings needs to surface an honest,
-- editable processor disclosure instead of a hard-coded claim.
-- See README.md "Privacy & compliance" for the corresponding text fix.
-- ============================================================================

alter table app_settings
  add column data_processing_notice text not null default
    'Audio recordings are uploaded to Supabase Storage and sent to ElevenLabs for transcription. Transcripts are sent to Anthropic (Claude) to draft summaries, action items, and minutes. All three processors operate under data-processing terms; no recording is processed on-device only. Consult the ZPPSU Data Protection Officer before recording an official meeting.';
