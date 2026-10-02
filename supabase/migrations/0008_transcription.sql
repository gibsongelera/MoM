-- ============================================================================
-- Transcription job tracking
--
-- Provider-agnostic: transcription_jobs records what we asked an ASR provider
-- to do and what came back, independent of which provider (ElevenLabs today,
-- AssemblyAI as a registered fallback — see src/lib/asr/). raw_response is
-- kept so a folding bug can be fixed and replayed without re-billing the
-- provider. transcript_speakers maps a diarized speaker_0/speaker_1 label to
-- a real person once a secretary assigns it.
-- ============================================================================

create type transcription_status as enum (
  'queued', 'uploading', 'processing', 'completed', 'failed', 'cancelled'
);

create table transcription_jobs (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  audio_id uuid not null references audio_recordings (id) on delete cascade,

  provider text not null default 'elevenlabs',
  provider_job_id text,               -- ElevenLabs transcription id
  model text,                          -- 'scribe_v2'

  requested_language text,             -- 'fil' | 'ceb' | 'eng' | null = auto
  detected_language text,
  language_probability numeric(4,3),
  diarize boolean not null default true,
  keyterms text[] not null default '{}',

  status transcription_status not null default 'queued',
  error_code text,
  error_detail text,
  attempts integer not null default 0,

  raw_response jsonb,                  -- keep for re-folding without re-billing
  transcript_id uuid references transcripts (id) on delete set null,

  audio_duration_sec integer,
  cost_usd numeric(10,4),

  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint transcription_jobs_error_consistent
    check (status <> 'failed' or error_code is not null)
);

create index transcription_jobs_meeting_idx on transcription_jobs (meeting_id);
create unique index transcription_jobs_provider_job_idx
  on transcription_jobs (provider, provider_job_id)
  where provider_job_id is not null;
create index transcription_jobs_status_idx on transcription_jobs (status)
  where status in ('queued', 'processing');

create trigger transcription_jobs_set_updated_at
  before update on transcription_jobs
  for each row execute function set_updated_at();

-- Diarization emits speaker_0, speaker_1... Humans map them to real people.
create table transcript_speakers (
  transcript_id uuid not null references transcripts (id) on delete cascade,
  speaker_label text not null,         -- 'speaker_0'
  profile_id uuid references profiles (id) on delete set null,
  display_name text not null,          -- editable; falls back to 'Speaker 1'
  primary key (transcript_id, speaker_label)
);

alter table transcripts
  add column provider text,
  add column detected_language text,
  add column diarized boolean not null default false;
