# 1. Entity-Relationship Diagram (ERD)

SmartMin Postgres schema as used by the live Supabase backend.

**FigJam:** [SmartMin ERD](https://www.figma.com/board/AccyuDMagIE8U1IX1mRIF6)  
**Sources:** `supabase/migrations/0001_schema.sql`, `0008`, `0010`–`0014`, `lib/types.ts`

---

## Visual

[![SmartMin ERD](https://s3-alpha.figma.com/thumbnails/8f7c1760-c910-4502-bef5-190db4ffbe65?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQ4GOSFWC737PW4NF%2F20260911%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260911T094422Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=3822adb965cf73b4c07db2c84568b05d7f66c174e41656c34fe9adbfd0acc64d)](https://www.figma.com/board/AccyuDMagIE8U1IX1mRIF6)

---

## Mermaid (renders in Markdown preview)

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : has
    DEPARTMENTS ||--o{ PROFILES : employs
    PROFILES |o--o| DEPARTMENTS : heads
    DEPARTMENTS ||--o{ MEETINGS : owns
    PROFILES ||--o{ MEETINGS : chairs
    MEETINGS ||--o{ MEETING_PARTICIPANTS : includes
    PROFILES ||--o{ MEETING_PARTICIPANTS : attends
    MEETINGS ||--o{ AUDIO_RECORDINGS : records
    AUDIO_RECORDINGS |o--o{ TRANSCRIPTS : sources
    MEETINGS ||--o{ TRANSCRIPTS : produces
    MEETINGS ||--o{ TRANSCRIPTION_JOBS : tracks
    AUDIO_RECORDINGS ||--o{ TRANSCRIPTION_JOBS : processes
    TRANSCRIPTS ||--o{ TRANSCRIPT_SPEAKERS : labels
    MEETINGS ||--o| MINUTES : documents
    MEETINGS ||--o| ATTENDANCE : captures
    MEETINGS |o--o{ TASKS : spawns
    DEPARTMENTS |o--o{ TASKS : scopes
    PROFILES |o--o{ TASKS : assigned
    PROFILES ||--o{ PERSONAL_MEETINGS : owns
    PROFILES ||--o{ NOTIFICATIONS : receives
    PROFILES |o--o{ AUDIT_LOG : triggers

    AUTH_USERS {
        uuid id PK
        text email
    }
    PROFILES {
        uuid id PK
        text name
        text email UK
        user_role role
        uuid department_id FK
        boolean active
    }
    DEPARTMENTS {
        uuid id PK
        text name
        text short UK
        uuid head_id FK
    }
    MEETINGS {
        uuid id PK
        text title
        uuid department_id FK
        meeting_status status
        boolean ai_processed
        json rsvps
    }
    MEETING_PARTICIPANTS {
        uuid meeting_id PK
        uuid user_id PK
        boolean attended
    }
    AUDIO_RECORDINGS {
        uuid id PK
        uuid meeting_id FK
        text storage_path
        int duration_sec
    }
    TRANSCRIPTS {
        uuid id PK
        uuid meeting_id FK
        json segments
        text summary
        text_array key_decisions
    }
    TRANSCRIPTION_JOBS {
        uuid id PK
        uuid meeting_id FK
        uuid audio_id FK
        transcription_status status
    }
    TRANSCRIPT_SPEAKERS {
        uuid transcript_id PK
        text speaker_label PK
        uuid profile_id FK
    }
    MINUTES {
        uuid id PK
        uuid meeting_id UK
        minutes_status status
        json signatures
        json paper_notes
        json ai_action_items
    }
    ATTENDANCE {
        uuid id PK
        uuid meeting_id UK
        json records
    }
    TASKS {
        uuid id PK
        text title
        uuid meeting_id FK
        uuid assignee_id FK
        task_status status
    }
    PERSONAL_MEETINGS {
        uuid id PK
        uuid user_id FK
        text title
        date meeting_date
    }
    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        text type
        boolean read
    }
    AUDIT_LOG {
        uuid id PK
        uuid user_id FK
        text action
        text detail
    }
    APP_SETTINGS {
        boolean id PK
        boolean ai_enabled
        int retention_days
    }
```

---

## Key design notes

| Concept | How it is modeled |
|---------|-------------------|
| Signatures / approvals | `minutes.signatures` jsonb + RPCs `sign_minutes`, `lock_minutes`, `route_minutes_for_approval` |
| RSVP | `meetings.rsvps` jsonb + `set_meeting_rsvp` (not a table) |
| Action items | `minutes.ai_action_items` / `action_items` → resolved rows in `tasks` |
| Storage | Buckets `meeting-audio`, `avatars` (not SQL entities) |
| Meeting status | `scheduled` → `recording` → `transcribed` → `pending_approval` → `approved` → `archived` |
