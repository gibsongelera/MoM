---
name: smartmin-system-diagrams
description: >-
  Generates and maintains accurate SmartMin system documentation diagrams
  (ERD, data flow, use case, flowchart, UML sequence, UML state) plus
  functional/non-functional requirements, glossary, and tech stack in one
  markdown file and FigJam. Use when the user asks for SmartMin diagrams,
  ERD, DFD, use cases, UML, FR/NFR, system documentation, or
  /figma-generate-diagram for this project.
disable-model-invocation: false
---

# SmartMin System Diagrams

## Goal

Keep **one accurate documentation artifact** for ZPPSU SmartMin:

- **Markdown:** `docs/SMARTMIN-SYSTEM-DOCUMENTATION.md` (single file, all sections)
- **FigJam:** board `fileKey=AccyuDMagIE8U1IX1mRIF6`  
  URL: https://www.figma.com/board/AccyuDMagIE8U1IX1mRIF6

Never invent tables, routes, roles, or statuses. Ground every diagram in code.

## When to use

- User asks for ERD / data flow / use case / flowchart / UML
- User wants FR, NFR, terms, or tech stack docs
- User runs `/figma-generate-diagram` in this repo
- User asks to refresh or reorganize system diagrams

## Mandatory skills / tools

1. Load **figma-generate-diagram** before every `generate_diagram` call.
2. Read the matching reference under that skill:
   - ERD → `references/erd.md`
   - Data flow (services/stores) → `references/architecture.md` + `useArchitectureLayoutCode: "FIGMA_DIAGRAM_2026"`
   - Process flowchart / use-case map → `references/flowchart.md`
   - UML interactions → `references/sequence.md` (`sequenceDiagram`)
   - Status lifecycle → `references/state.md` (`stateDiagram-v2`)
3. Prefer **code-architect** (or direct reads) against:
   - `supabase/migrations/0001_schema.sql` + `0008`, `0010`–`0014`
   - `lib/types.ts`, `lib/db.ts`, `lib/nav.ts`
   - `app/api/**/route.ts`
   - `CLAUDE.md`, `package.json`

## Accuracy rules (do not violate)

| Rule | Detail |
|------|--------|
| DB wins | Migrations beat `supabase/ERD.md` and any stale docs |
| No fake tables | Signatures → `minutes.signatures` jsonb; RSVP → `meetings.rsvps`; approvals → RPCs |
| Roles only | `admin`, `head`, `secretary`, `faculty` |
| Meeting status | `scheduled` \| `recording` \| `transcribed` \| `pending_approval` \| `approved` \| `archived` |
| AI is stateless | `/api/transcribe` and `/api/ai/*` return JSON; persist via `lib/db` |
| STT provider | **ElevenLabs Scribe** (not AssemblyAI) |
| LLM | **Anthropic Claude** via server routes only |
| Source of truth | Supabase — do not document localStorage as primary storage |

## Unsupported FigJam types

`generate_diagram` does **not** support UML class, pie, mindmap, C4, journey, etc.

| User asks for | Produce instead |
|---------------|-----------------|
| UML class diagram | ERD (+ note in MD that class diagrams are unsupported) |
| UML use case ovals | Actor→capability **flowchart** from `lib/nav.ts` |
| UML interaction | `sequenceDiagram` |
| UML state | `stateDiagram-v2` for meeting/minutes status |

## Required diagram set

Always keep these six on the same FigJam board (`fileKey` above):

1. **ERD** — core tables + keys (trim to ~5–10 attrs/entity)
2. **Data flow architecture** — client/gateway/service/datastore/external lanes
3. **Use case map** — four actors + shared assistant/profile/dashboard
4. **Lifecycle flowchart** — schedule → AI → attendance → approval → archive
5. **UML sequence** — secretary → STT → Claude → db → head sign/lock
6. **UML state** — meeting_status transitions with real RPC names

## Output layout (one MD file)

Update **only** `docs/SMARTMIN-SYSTEM-DOCUMENTATION.md` as the single deliverable. Sections in this order:

1. System overview  
2. Technology stack  
3. Terms and definitions  
4. Functional requirements (FR-xx)  
5. Non-functional requirements (NFR-xx)  
6. ERD (thumbnail + Mermaid + FigJam link)  
7. Data flow (thumbnail + Mermaid + FigJam link)  
8. Use case (thumbnail + Mermaid + FigJam link)  
9. Flowchart (thumbnail + Mermaid + FigJam link)  
10. UML sequence (thumbnail + Mermaid + FigJam link)  
11. UML state (thumbnail + Mermaid + FigJam link)  
12. Roles and routes  
13. Sources of truth  

Each diagram section must include:

- FigJam thumbnail image (`![](imageUrl)` from tool response)
- Link to the board
- Editable Mermaid source matching what was sent to `generate_diagram`

## FigJam workflow

1. Reuse `fileKey=AccyuDMagIE8U1IX1mRIF6` — **do not** create a new board per diagram.
2. First iteration in a session: ask whether to replace old nodes or place new diagrams beside them; default to **side-by-side** if unclear.
3. Universal Mermaid constraints: no emojis, no `\n` in labels, no HTML, camelCase IDs, quote special chars, never use `end`/`subgraph`/`graph` as node IDs.
4. Architecture diagrams: every node inside subgraph IDs `client|gateway|service|datastore|external|async` only; edges must follow architecture.md allowed table.
5. After generation, refresh thumbnail URLs in the MD file.

## FR / NFR / glossary / tech

- **Tech:** read `package.json` + `CLAUDE.md` (Next 16, React 19, Supabase, ElevenLabs, Claude, Tailwind, docx, Zod).
- **FR:** derive from `lib/nav.ts` + secretary/head pages + AI/export APIs — do not invent features.
- **NFR:** security (RLS, server-only keys), privacy, bilingual EN/TL, graceful AI fallback, brand tokens, CHED-style minutes.
- **Glossary:** MoM, transcript, RLS, RPC, grounded assistant, paper notes, RSVP, signature, department scope, fallback pipeline.

## Done checklist

- [ ] All six diagrams present on the shared FigJam board  
- [ ] Single MD file updated with images + Mermaid + FR/NFR/tech/glossary  
- [ ] No invented schema objects  
- [ ] FigJam links and thumbnails current  
- [ ] Skill instructions followed (architecture code only for data-flow arch)
