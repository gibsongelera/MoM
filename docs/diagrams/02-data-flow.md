# 2. Data Flow Diagram

How data moves through SmartMin: browser → Next.js → AI/Auth providers → Supabase.

**FigJam:** [SmartMin Data Flow Architecture](https://www.figma.com/board/AccyuDMagIE8U1IX1mRIF6)  
**Sources:** `app/api/**`, `lib/db.ts`, `lib/ai-client.ts`, `middleware.ts`, `components/DataProvider.tsx`

---

## Visual

[![SmartMin Data Flow](https://s3-alpha.figma.com/thumbnails/36d1baf6-76a2-49d1-9c0d-75b01608c3fd?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQ4GOSFWC737PW4NF%2F20260911%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260911T094515Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=b167f87b3398d22300f546e9f30ecd2461175dcb507a0875043ba9e1e1841447)](https://www.figma.com/board/AccyuDMagIE8U1IX1mRIF6)

---

## Mermaid (architecture lanes)

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

---

## AI product pipeline

```text
Audio (live / upload)
  → Storage audio_recordings
  → POST /api/transcribe          (ElevenLabs)
  → POST /api/ai/analyze          (Claude)
  → saveTranscript / saveMinutes / tasks  (lib/db)
  → optional: /api/ai/translate | read-notes | chat
```

Fallbacks when keys are missing: `lib/transcriber.ts`, `lib/summarizer.ts`, `lib/translator.ts`.

---

## API route map

| Route | Purpose |
|-------|---------|
| `POST /api/transcribe` | ElevenLabs STT |
| `POST /api/ai/analyze` | Summary, decisions, action items, MoM draft |
| `POST /api/ai/chat` | Grounded meeting assistant |
| `POST /api/ai/translate` | EN ↔ Tagalog |
| `POST /api/ai/read-notes` | Handwriting OCR → `paper_notes` |
| `POST /api/export/minutes` | Minutes `.docx` |
| `POST /api/export/attendance` | Signed attendance export |
| `POST /api/auth/register` | Self-registration |
| `POST /api/auth/forgot-password` | Reset email |
| `POST /api/auth/resend-confirmation` | Confirm email |
| `POST/PATCH/DELETE /api/admin/users` | Admin user CRUD |
| `POST/PATCH /api/head/members` | Department members |
| `GET /api/departments` | Department list |
