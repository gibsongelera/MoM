# SmartMin entity–relationship diagram

Reflects `supabase/migrations/0001_schema.sql` (tables, keys, FKs). The
migrations are the authoritative schema; this file is the readable view of them.
If they disagree, the migration wins.

## Diagram

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : "profiles.id (cascade)"
  DEPARTMENTS ||--o{ PROFILES : "profiles.department_id"
  PROFILES |o--o| DEPARTMENTS : "departments.head_id"

  DEPARTMENTS ||--o{ MEETINGS : "meetings.department_id (restrict)"
  PROFILES ||--o{ MEETINGS : "chair_id, secretary_id, chairperson_id, adviser_id"

  MEETINGS ||--o{ MEETING_PARTICIPANTS : "meeting_id (cascade)"
  PROFILES ||--o{ MEETING_PARTICIPANTS : "user_id (cascade)"

  MEETINGS ||--o{ AUDIO_RECORDINGS : "meeting_id (cascade)"
  PROFILES ||--o{ AUDIO_RECORDINGS : "created_by"
  AUDIO_RECORDINGS |o--o{ TRANSCRIPTS : "source_audio_id"

  MEETINGS ||--o{ TRANSCRIPTS : "meeting_id (cascade)"
  MEETINGS ||--o| MINUTES : "meeting_id UNIQUE (cascade)"
  PROFILES |o--o{ MINUTES : "locked_by"

  MEETINGS |o--o{ TASKS : "meeting_id (set null)"
  DEPARTMENTS |o--o{ TASKS : "department_id"
  PROFILES |o--o{ TASKS : "assignee_id, delegated_by"

  PROFILES ||--o{ PERSONAL_MEETINGS : "user_id (cascade)"
  PROFILES ||--o{ NOTIFICATIONS : "user_id (cascade)"
  PROFILES |o--o{ AUDIT_LOG : "user_id (set null)"

  AUTH_USERS {
    uuid id PK
    text email
    jsonb raw_user_meta_data
  }

  DEPARTMENTS {
    uuid id PK
    text name
    text short UK
    department_type type
    uuid head_id FK
    text office_location
    timestamptz created_at
    timestamptz updated_at
  }

  PROFILES {
    uuid id PK "FK auth.users.id"
    text name
    text email UK
    user_role role
    uuid department_id FK
    text position
    boolean active
    date joined_at
    text photo_path "object path in the avatars bucket"
    timestamptz created_at
    timestamptz updated_at
  }

  MEETING_SUBTYPES {
    uuid id PK
    meeting_type meeting_type
    text label
    integer position
  }

  MEETINGS {
    uuid id PK
    text title
    timestamptz starts_at
    integer duration_min
    text venue
    uuid department_id FK
    uuid chair_id FK
    uuid secretary_id FK
    text_array agenda
    meeting_status status
    boolean ai_processed
    text language "en-US, tl-PH, tl-PH-mixed"
    meeting_type meeting_type
    text sub_type "required unless type = regular"
    text project_title
    uuid chairperson_id FK
    uuid_array panel_member_ids "soft reference, no FK"
    uuid adviser_id FK
    timestamptz created_at
    timestamptz updated_at
  }

  MEETING_PARTICIPANTS {
    uuid meeting_id PK "FK meetings.id"
    uuid user_id PK "FK profiles.id"
    boolean attended
  }

  AUDIO_RECORDINGS {
    uuid id PK
    uuid meeting_id FK
    text storage_path "null until the blob leaves IndexedDB"
    integer duration_sec
    text language
    text mime_type
    timestamptz captured_at
    timestamptz uploaded_at
    uuid created_by FK
    timestamptz created_at
  }

  TRANSCRIPTS {
    uuid id PK
    uuid meeting_id FK
    text language "source language of segments[]"
    jsonb segments "one object per turn - speakerId, speaker, t, text"
    text summary
    text translated_to "set only on a translated pass"
    numeric confidence
    jsonb comments "id, ts, userId, name, text"
    uuid source_audio_id FK
    text ai_model
    timestamptz created_at
    timestamptz updated_at
  }

  MINUTES {
    uuid id PK
    uuid meeting_id FK "UNIQUE - one minutes per meeting"
    text document_title
    text call_to_order
    text previous_minutes
    jsonb agenda_items "title, notes"
    text adjournment
    text ai_summary
    jsonb signatures "userId, name, role, signedAt, dataUrl"
    jsonb comments
    jsonb amendments "ts, byUserId, byName, summary"
    minutes_status status
    timestamptz locked_at
    uuid locked_by FK
    timestamptz created_at
    timestamptz updated_at
  }

  TASKS {
    uuid id PK
    text title
    text description
    uuid meeting_id FK
    uuid department_id FK
    uuid assignee_id FK
    uuid delegated_by FK
    task_priority priority
    date deadline
    task_status status
    boolean ai_extracted
    numeric confidence
    timestamptz created_at
    timestamptz updated_at
  }

  PERSONAL_MEETINGS {
    uuid id PK
    uuid user_id FK
    date meeting_date
    time meeting_time
    text type
    text title
    text attendees
    text notes
    timestamptz created_at
    timestamptz updated_at
  }

  NOTIFICATIONS {
    uuid id PK
    uuid user_id FK
    text type
    text title
    text body
    boolean read
    timestamptz created_at
  }

  AUDIT_LOG {
    uuid id PK
    uuid user_id FK "set null - the trail outlives the account"
    text user_name "denormalised for the same reason"
    user_role role
    text action
    text detail
    timestamptz created_at
  }

  APP_SETTINGS {
    boolean id PK "check (id) - single row"
    boolean ai_enabled
    boolean auto_transcribe
    boolean auto_summarize
    boolean auto_upload_on_reconnect
    boolean local_processing_only
    integer retention_days
    text default_language
    text institution_name
    text institution_short
    timestamptz updated_at
  }
```

`MEETING_SUBTYPES` and `APP_SETTINGS` carry no foreign keys, so they float free of
the diagram's edges: sub-types are keyed by the `meeting_type` enum value rather
than by a row, and `app_settings` is a one-row table pinned by
`check (id)`.

## Enums

| Enum | Values |
|---|---|
| `user_role` | `admin`, `head`, `secretary`, `faculty` |
| `department_type` | `college`, `office` |
| `meeting_type` | `regular`, `capstone`, `research` |
| `meeting_status` | `scheduled`, `recording`, `transcribed`, `pending_approval`, `approved`, `archived` |
| `minutes_status` | `draft`, `pending_approval`, `approved` |
| `task_status` | `pending`, `in_progress`, `done` |
| `task_priority` | `low`, `medium`, `high` |

## Delete behaviour worth remembering

- Deleting an `auth.users` row cascades to its `profiles` row, and from there to
  that person's `meeting_participants`, `personal_meetings` and `notifications`.
- Deleting a meeting cascades to its participants, audio recordings, transcripts
  and minutes — but only nulls `tasks.meeting_id`, because an action item can
  outlive the meeting that produced it.
- `meetings.department_id` is `on delete restrict`: a department with meetings
  cannot be deleted out from under them.
- `audit_log.user_id` is `on delete set null` and `user_name` is denormalised, so
  the trail survives account deletion.

## What the diagram does not show

Row-level security. Every table has RLS enabled in `0002_rls.sql`, and meeting
visibility lives in exactly one function, `sm_can_see_meeting()`, which
`meetings`, `meeting_participants`, `transcripts`, `minutes`,
`audio_recordings` and the `meeting-audio` storage policies all call. Read the
FK graph as "what can reference what", not as "who can read what".

---

# Multilingual transcripts (English / Tagalog / Taglish)

Walang schema change na kailangan — the columns already carry this. Ang mahalaga
ay kung saan mo isusulat ang bawat piraso.

## 1. `meetings.language` — the mode of the meeting

This is the switch the app reads, not decoration. Values in use:

| Value | Meaning |
|---|---|
| `en-US` | English meeting |
| `tl-PH` | Tagalog/Filipino meeting |
| `tl-PH-mixed` | Taglish — halo ang English at Tagalog sa iisang pulong |

`src/lib/ai/prompts.ts` tests `meeting.language?.startsWith('tl')`. Anything
starting with `tl` tells Claude that the transcript is partly or wholly in
Filipino, and that the minutes must come out in English while preserving
Filipino terms that have no accurate English equivalent (`pakiusap`,
`bayanihan`, `barangay`-level references, and so on).

**Kaya `tl-PH-mixed` ang gamitin para sa Taglish, hindi plain `mixed`.** A bare
`mixed` does not start with `tl`, so the Filipino instruction never reaches the
prompt and the model treats the meeting as English-only. Same trap with `fil-PH`
— walang `tl` prefix, so it silently loses the guidance.

## 2. `transcripts.segments[].text` — the actual dialogue

Store the speech verbatim, exactly as spoken. Hindi kailangang i-translate,
hindi rin kailangang paghiwalayin ang English at Tagalog na sentences. One
segment per turn:

```json
[
  {
    "speakerId": "…uuid…",
    "speaker": "Engr. Ricardo Gomez",
    "t": 0,
    "text": "Good morning, everyone. Magsisimula na tayo — kumpleto na ang quorum."
  },
  {
    "speakerId": "…uuid…",
    "speaker": "Sarah Torres",
    "t": 24,
    "text": "Sir, ang minutes po ng June 20 meeting ay naipamahagi na. May I move for their approval?"
  }
]
```

`t` is the offset in seconds from the start of the recording, so the transcript
pane can seek the audio. Taglish within a single sentence is fine and expected —
huwag itong linisin, that is the record.

## 3. `transcripts.language` — the source language of those segments

Mirror the meeting mode (`tl-PH-mixed` for Taglish). Ito ang sinasabi kung anong
wika ang nasa `segments[]` **ngayon**, not what you wish it were.

## 4. `transcripts.translated_to` — only on a translated pass

Kapag gumawa ka ng English rendering ng isang Tagalog transcript, that is a
**second row** in `transcripts` for the same `meeting_id`:

| Column | Source pass | Translated pass |
|---|---|---|
| `language` | `tl-PH-mixed` | `tl-PH-mixed` — still the *source* language |
| `translated_to` | `null` | `en-US` |
| `segments[].text` | verbatim Taglish | English rendering |
| `ai_model` | e.g. `web-speech` | the translating model |

Never overwrite the original in place. `transcripts.meeting_id` has no unique
constraint precisely so both passes can coexist; the verbatim pass is the
evidentiary record and the translation is derived from it. Kung ma-overwrite mo
ang original, wala ka nang mababalikan.

## 5. `audio_recordings.language`

Whatever locale the browser's speech recogniser was set to when the audio was
captured. It describes the capture, not the interpretation, so it can differ
from `meetings.language` — a recorder left on `en-US` during a Taglish meeting
is exactly the case worth being able to see afterwards.

## Quick checklist

- Taglish meeting → `meetings.language = 'tl-PH-mixed'` (never plain `mixed`).
- Verbatim speech → `transcripts.segments[].text`, walang paglilinis.
- `transcripts.language` = source language, always.
- Translation → new `transcripts` row with `translated_to` set, original kept.
- Minutes come out in English regardless; the prompt handles that.
