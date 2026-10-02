# ZPPSU SmartMin — Complete System Documentation

One-file reference for diagrams, requirements, glossary, and technology stack.  
Aligned to the live Next.js + Supabase implementation (migrations `0001`–`0014`).

**FigJam board (all diagrams):** [Open editable FigJam](https://www.figma.com/board/AccyuDMagIE8U1IX1mRIF6)

---

## Table of contents

1. [System overview](#1-system-overview)
2. [Technology stack](#2-technology-stack)
3. [Terms and definitions](#3-terms-and-definitions)
4. [Functional requirements](#4-functional-requirements)
5. [Non-functional requirements](#5-non-functional-requirements)
6. [ERD diagram](#6-erd-diagram)
7. [Data flow diagram](#7-data-flow-diagram)
8. [Use case diagram](#8-use-case-diagram)
9. [Flowchart — meeting lifecycle](#9-flowchart--meeting-lifecycle)
10. [UML sequence diagram](#10-uml-sequence-diagram)
11. [UML state diagram](#11-uml-state-diagram)
12. [Roles and routes](#12-roles-and-routes)
13. [Sources of truth](#13-sources-of-truth)

---

## 1. System overview

**SmartMin** is an AI-assisted institutional meeting-governance system for  
**Zamboanga Peninsula Polytechnic State University (ZPPSU)**.

Pipeline:

```text
Audio → Transcript → Summary → Decisions → Action Items → Minutes → Approval → Archive
```

Four roles: **admin**, **head**, **secretary**, **faculty**. Data is scoped by department with Supabase RLS.

---

## 2. Technology stack

| Layer | Technology | Role in SmartMin |
|-------|------------|------------------|
| Framework | **Next.js 16** (App Router) | Pages, API routes, middleware |
| UI | **React 19** + **TypeScript 5.9** | Client pages under `app/(app)` |
| Styling | **Tailwind CSS 3** | Brand tokens (maroon `#570000`, gold `#cba72f`) |
| Auth + DB | **Supabase** (Auth, Postgres, Storage, Realtime, RLS) | Source of truth for users and meeting data |
| Data access | `lib/db.ts` + `components/DataProvider.tsx` | Snake_case ↔ camelCase mapping, mutations, RPCs |
| STT | **ElevenLabs Scribe** via `POST /api/transcribe` | Speech-to-text |
| LLM | **Anthropic Claude** via `/api/ai/*` | Analyze, chat, translate, OCR notes |
| Documents | **docx** | Minutes and attendance export |
| Charts | **Chart.js** / react-chartjs-2 | Dashboards / reports |
| Validation | **Zod** | Request/schema validation |
| Mail | **Nodemailer** | Auth/reset emails when configured |
| Hosting (dev) | `npm run dev` port **3000** | Local development |

**Not used as source of truth:** legacy `lib/store.ts` / `localStorage` (migration leftover).

---

## 3. Terms and definitions

| Term | Definition |
|------|------------|
| **MoM** | Minutes of the Meeting — formal CHED-oriented document (`minutes` table) |
| **Transcript** | Time-segmented speech text with speakers, summary, key decisions |
| **Action item** | Task extracted from discussion; staged in minutes JSON, resolved in `tasks` |
| **RLS** | Row Level Security — Postgres policies scoping rows by role/department |
| **RPC** | Supabase `SECURITY DEFINER` function (e.g. `sign_minutes`, `lock_minutes`) |
| **Grounded assistant** | AI chat that answers only from the open meeting’s transcript/notes |
| **Paper notes** | Handwritten panel notes OCR’d via Claude vision into `minutes.paper_notes` |
| **RSVP** | Invite response stored in `meetings.rsvps` JSONB (not a separate table) |
| **Signature** | Canvas/data-URL signature stored in `minutes.signatures` JSONB |
| **AI-processed** | Meeting flag after successful transcribe/analyze path |
| **Department scope** | Head/secretary/faculty only see their department’s meetings (admin sees all) |
| **Fallback pipeline** | On-device STT/summarizer/translator when API keys are missing |

---

## 4. Functional requirements

| ID | Requirement | Primary actor |
|----|-------------|----------------|
| FR-01 | Register / login / password reset with email confirmation | All |
| FR-02 | Role-based access to dashboards and pages | All |
| FR-03 | Manage users, departments, system settings, audit log | Admin |
| FR-04 | Schedule meetings with agenda, venue, participants | Secretary |
| FR-05 | Live-record or upload meeting audio to Storage | Secretary |
| FR-06 | Transcribe audio (ElevenLabs) and store segments | Secretary |
| FR-07 | Analyze transcript into summary, decisions, action items, MoM draft | Secretary |
| FR-08 | Edit transcripts and minutes; translate EN↔Tagalog | Secretary |
| FR-09 | OCR handwritten notes and keep them with minutes | Secretary |
| FR-10 | Capture attendance with per-attendee signatures; export `.docx` | Secretary |
| FR-11 | Route minutes for head approval; notify chair | Secretary |
| FR-12 | Review, sign, approve/lock, or return minutes | Head |
| FR-13 | Delegate tasks to faculty; manage department members | Head |
| FR-14 | View calendar, reports, department KPIs | Head |
| FR-15 | RSVP to meetings; track assigned tasks | Faculty |
| FR-16 | View permitted transcripts / personal meetings | Faculty |
| FR-17 | Use grounded AI assistant scoped to an open meeting | All |
| FR-18 | Archive / unarchive approved meetings | Secretary |
| FR-19 | Export minutes document | Secretary / Head |
| FR-20 | Audit privacy-sensitive actions | Admin |

---

## 5. Non-functional requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Security | API keys server-only (`process.env`); never `NEXT_PUBLIC_` for secrets |
| NFR-02 | Security | Supabase RLS + `useRequireRole` + middleware session refresh |
| NFR-03 | Privacy | Audit log; retention settings in `app_settings`; data-processing notice |
| NFR-04 | Reliability | AI routes degrade to local fallbacks when unconfigured |
| NFR-05 | Integrity | Locked minutes require amend RPC to reopen; signatures retained in JSONB |
| NFR-06 | Usability | UI matches ZPPSU brand (maroon/gold); Material Symbols icons |
| NFR-07 | Localization | Bilingual English / Tagalog for transcript and minutes content |
| NFR-08 | Performance | Client caches RLS-scoped collections via `DataProvider`; refresh after mutations |
| NFR-09 | Maintainability | Schema in versioned SQL migrations; app fields in additive `0011+` |
| NFR-10 | Availability | Realtime notifications (`0014`); storage paths gated by meeting visibility |
| NFR-11 | Compliance | CHED-style minutes layout (date, participants, discussion, decisions, actions, approval) |
| NFR-12 | Portability | Next.js App Router deployable; env via `.env.local` / `.env.example` |

---

## 6. ERD diagram

**Purpose:** Tables, keys, and cardinalities for SmartMin Postgres.

![SmartMin ERD](https://s3-alpha.figma.com/thumbnails/8f7c1760-c910-4502-bef5-190db4ffbe65?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQ4GOSFWC737PW4NF%2F20260911%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260911T094422Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=3822adb965cf73b4c07db2c84568b05d7f66c174e41656c34fe9adbfd0acc64d)

[Edit in FigJam](https://www.figma.com/board/AccyuDMagIE8U1IX1mRIF6)

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

**Modeling notes:** Signatures, RSVPs, and approvals are JSONB / RPCs — not separate tables.

---

## 7. Data flow diagram

**Purpose:** Browser → middleware → pages/API → Claude / ElevenLabs / Auth → Postgres + Storage.

![SmartMin Data Flow](https://s3-alpha.figma.com/thumbnails/36d1baf6-76a2-49d1-9c0d-75b01608c3fd?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQ4GOSFWC737PW4NF%2F20260911%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260911T094515Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=b167f87b3398d22300f546e9f30ecd2461175dcb507a0875043ba9e1e1841447)

[Edit in FigJam](https://www.figma.com/board/AccyuDMagIE8U1IX1mRIF6)

```mermaid
flowchart LR
    subgraph client ["Clients"]
        browser["Browser App"]
    end
    subgraph gateway ["Gateway"]
        nextMw["Next.js Middleware"]
    end
    subgraph service ["App Services"]
        appPages["Role Pages"]
        apiAi["AI API Routes"]
        apiAuth["Auth API Routes"]
        apiExport["Export API Routes"]
        libDb["lib/db Data Layer"]
    end
    subgraph datastore ["Data Stores"]
        postgres["Supabase Postgres"]
        storage["Supabase Storage"]
    end
    subgraph external ["External"]
        claude["Anthropic Claude"]
        elevenlabs["ElevenLabs Scribe"]
        supabaseAuth["Supabase Auth"]
    end

    browser -->|"HTTPS"| nextMw
    nextMw -->|"Session guard"| appPages
    appPages -->|"useData mutations"| libDb
    appPages -->|"transcribe analyze chat"| apiAi
    appPages -->|"register reset"| apiAuth
    appPages -->|"minutes attendance"| apiExport
    libDb -->|"RLS queries"| postgres
    libDb -->|"audio avatars"| storage
    apiExport -->|"Reads docs"| postgres
    apiAi -.->|"Claude: Analyze Chat Translate OCR"| claude
    apiAi -.->|"ElevenLabs: STT"| elevenlabs
    apiAuth -.->|"Supabase Auth: Sessions"| supabaseAuth
    appPages <---|"JSON results"| apiAi
    appPages <---|"docx download"| apiExport
```

### API routes

| Route | Purpose |
|-------|---------|
| `POST /api/transcribe` | ElevenLabs STT |
| `POST /api/ai/analyze` | Summary, decisions, actions, MoM draft |
| `POST /api/ai/chat` | Grounded assistant |
| `POST /api/ai/translate` | EN ↔ Tagalog |
| `POST /api/ai/read-notes` | Handwriting OCR |
| `POST /api/export/minutes` | Minutes `.docx` |
| `POST /api/export/attendance` | Signed attendance export |
| `/api/auth/*` | Register, forgot password, resend confirmation |
| `/api/admin/users` | Admin user CRUD |
| `/api/head/members` | Department member management |
| `GET /api/departments` | Department list |

---

## 8. Use case diagram

**Purpose:** Capabilities per actor. (UML oval use-case syntax is not supported by FigJam `generate_diagram`; this is an equivalent actor→capability map.)

![SmartMin Use Cases](https://s3-alpha.figma.com/thumbnails/1ed7cb43-8c3d-4eb4-8d45-c4596bfb62d8?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQ4GOSFWC737PW4NF%2F20260911%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260911T094519Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=8a56214cad5b192bd263d77bb8fc0c1d5306159a1bef0e8c4c2f2f88885cadd1)

[Edit in FigJam](https://www.figma.com/board/AccyuDMagIE8U1IX1mRIF6)

```mermaid
flowchart TB
    subgraph actors ["Actors"]
        admin(["Admin"])
        head(["Head"])
        secretary(["Secretary"])
        faculty(["Faculty"])
    end

    subgraph adminUc ["Admin"]
        a1["Manage Users"]
        a2["Manage Departments"]
        a3["View All Meetings"]
        a4["Audit and Privacy"]
        a5["System Settings"]
    end

    subgraph headUc ["Head"]
        h1["Approve and Sign Minutes"]
        h2["Delegate Tasks"]
        h3["Manage Dept Members"]
        h4["View Reports"]
        h5["Department Calendar"]
    end

    subgraph secUc ["Secretary"]
        s1["Schedule Meeting"]
        s2["Live Recording"]
        s3["Upload Audio"]
        s4["Edit Transcript"]
        s5["Edit Minutes"]
        s6["Capture Attendance"]
        s7["Route for Approval"]
        s8["Archive Meetings"]
    end

    subgraph facUc ["Faculty"]
        f1["View My Meetings"]
        f2["RSVP to Meeting"]
        f3["Track My Tasks"]
        f4["Personal Meetings"]
        f5["View Transcript"]
    end

    subgraph sharedUc ["Shared"]
        sh1["AI Assistant"]
        sh2["Profile"]
        sh3["Dashboard"]
    end

    admin --> a1 & a2 & a3 & a4 & a5
    head --> h1 & h2 & h3 & h4 & h5
    secretary --> s1 & s2 & s3 & s4 & s5 & s6 & s7 & s8
    faculty --> f1 & f2 & f3 & f4 & f5
    admin & head & secretary & faculty --> sh1 & sh2 & sh3

    style actors fill:#FFECBD,stroke:#FFC943
    style adminUc fill:#FFCDC2,stroke:#FF7556
    style headUc fill:#C2E5FF,stroke:#3DADFF
    style secUc fill:#CDF4D3,stroke:#66D575
    style facUc fill:#DCCCFF,stroke:#874FFF
    style sharedUc fill:#D9D9D9,stroke:#B3B3B3
```

---

## 9. Flowchart — meeting lifecycle

**Purpose:** Secretary + Head end-to-end process with approve/return branch.

![SmartMin Flowchart](https://s3-alpha.figma.com/thumbnails/a93183c6-4059-42cc-9f47-1fe1be0edb15?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQ4GOSFWC737PW4NF%2F20260911%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260911T094521Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=6b654d1f3c46774cd4e3bef1053176e8823841b25077cd64c0f214924fa18c67)

[Edit in FigJam](https://www.figma.com/board/AccyuDMagIE8U1IX1mRIF6)

```mermaid
flowchart LR
    start(["Start"]) --> schedule["Schedule Meeting"]
    schedule --> record{{"Record or Upload?"}}
    record -->|"Live"| liveRec["Live Recording"]
    record -->|"File"| upload["Upload Audio"]
    liveRec --> saveAudio["Save audio_recordings"]
    upload --> saveAudio
    saveAudio --> transcribe["POST /api/transcribe"]
    transcribe --> analyze["POST /api/ai/analyze"]
    analyze --> editMom["Edit MoM Draft"]
    editMom --> attendance["Capture Attendance"]
    attendance --> routeAppr["route_minutes_for_approval"]
    routeAppr --> headReview["Head Reviews"]
    headReview --> decision{{"Approve?"}}
    decision -->|"Yes"| signLock["sign_minutes + lock_minutes"]
    decision -->|"No"| returned["Return to Secretary"]
    returned -.-> editMom
    signLock --> approved["Status approved"]
    approved --> archive["Archive Meeting"]
    archive --> done(["Done"])

    style schedule fill:#C2E5FF,stroke:#3DADFF
    style transcribe fill:#DCCCFF,stroke:#874FFF
    style analyze fill:#DCCCFF,stroke:#874FFF
    style routeAppr fill:#FFECBD,stroke:#FFC943
    style signLock fill:#CDF4D3,stroke:#66D575
    style returned fill:#FFCDC2,stroke:#FF7556
    style archive fill:#D9D9D9,stroke:#B3B3B3
```

| Step | Meeting status | Minutes status |
|------|----------------|----------------|
| Schedule | `scheduled` | — |
| Transcribe / analyze | `transcribed` | `draft` |
| Route approval | `pending_approval` | `pending_approval` |
| Sign + lock | `approved` | `approved` |
| Return | `transcribed` | `draft` |
| Archive | `archived` | `approved` |

---

## 10. UML sequence diagram

**Purpose:** Time-ordered interactions for the AI pipeline and approval (UML interaction view).  
**Note:** UML *class* diagrams are not supported by FigJam `generate_diagram`; use the ERD for structural model.

![SmartMin UML Sequence](https://s3-alpha.figma.com/thumbnails/02f77194-c73b-4bca-9527-0e03abea1cab?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQ4GOSFWC737PW4NF%2F20260911%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260911T095539Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=b57dea4772c7f98333edd6bdaa69f38612dfd5876585b168ef88cf6af903a41c)

[Edit in FigJam](https://www.figma.com/board/AccyuDMagIE8U1IX1mRIF6)

```mermaid
sequenceDiagram
    title SmartMin AI Pipeline UML Sequence
    participant Secretary
    participant BrowserApp
    participant ApiTranscribe
    participant ElevenLabs
    participant ApiAnalyze
    participant Claude
    participant LibDb
    participant Supabase
    participant Head

    Secretary->>BrowserApp: Upload or record audio
    BrowserApp->>LibDb: Save audio_recordings
    LibDb->>Supabase: Insert + Storage upload
    BrowserApp->>ApiTranscribe: POST /api/transcribe
    ApiTranscribe->>ElevenLabs: Scribe STT
    ElevenLabs-->>ApiTranscribe: segments JSON
    ApiTranscribe-->>BrowserApp: transcript segments
    BrowserApp->>ApiAnalyze: POST /api/ai/analyze
    ApiAnalyze->>Claude: Summary decisions actions
    Claude-->>ApiAnalyze: structured draft
    ApiAnalyze-->>BrowserApp: MoM draft JSON
    BrowserApp->>LibDb: saveTranscript saveMinutes
    LibDb->>Supabase: Persist under RLS
    Secretary->>BrowserApp: Route for approval
    BrowserApp->>LibDb: route_minutes_for_approval
    LibDb->>Supabase: pending_approval + notify
    Head->>BrowserApp: Review and sign
    BrowserApp->>LibDb: sign_minutes lock_minutes
    LibDb->>Supabase: approved + locked
```

---

## 11. UML state diagram

**Purpose:** `meeting_status` state machine.

![SmartMin Meeting Status](https://s3-alpha.figma.com/thumbnails/2fccfed5-98a9-4ae3-a100-6687497527fd?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQ4GOSFWC737PW4NF%2F20260911%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260911T095612Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=f26b68f3d0304c398539adf9c9f73763d03c50c95dbf120ec2d9a8d0b811fe1c)

[Edit in FigJam](https://www.figma.com/board/AccyuDMagIE8U1IX1mRIF6)

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Scheduled
    Scheduled --> Recording: start capture
    Scheduled --> Transcribed: upload then AI
    Recording --> Transcribed: transcribe analyze
    Transcribed --> PendingApproval: route_minutes_for_approval
    PendingApproval --> Approved: sign_minutes lock_minutes
    PendingApproval --> Transcribed: return to secretary
    Approved --> Archived: archive
    Archived --> Approved: unarchive
    Approved --> [*]
```

---

## 12. Roles and routes

| Role | Key routes |
|------|------------|
| Admin | `/admin/dashboard`, `/admin/users`, `/admin/departments`, `/admin/meetings`, `/admin/audit`, `/admin/settings` |
| Head | `/head/dashboard`, `/head/calendar`, `/head/approvals`, `/head/delegate`, `/head/members`, `/head/reports` |
| Secretary | `/secretary/schedule`, `/secretary/live-recording`, `/secretary/upload-audio`, `/secretary/transcript`, `/secretary/mom-editor`, `/secretary/attendance`, `/secretary/archives` |
| Faculty | `/faculty/dashboard`, `/faculty/my-meetings`, `/faculty/my-tasks`, `/faculty/personal-meetings`, `/faculty/transcript-view` |
| Shared | `/assistant`, `/profile` |

---

## 13. Sources of truth

| Concern | Canonical source |
|---------|------------------|
| Schema | `supabase/migrations/*.sql` |
| App types | `lib/types.ts` |
| Mutations / RPCs | `lib/db.ts`, `0003_functions.sql` |
| Nav / use cases | `lib/nav.ts` |
| AI / export APIs | `app/api/**` |
| Brand / theme | `tailwind.config.ts`, `app/globals.css` |
| Env names | `.env.example` |

**Regenerate / refresh:** use project skill `.cursor/skills/smartmin-system-diagrams` and reuse FigJam `fileKey=AccyuDMagIE8U1IX1mRIF6`.
