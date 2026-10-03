# ZPPSU SmartMin

AI-assisted meeting governance for Zamboanga Peninsula Polytechnic State
University. Secretaries schedule meetings (or start an emergency meeting on the
spot), record or upload them, take attendance with signatures, keep photos and
handwritten panel notes as evidence, and get AI-drafted CHED-format minutes
that the department head reviews, signs and locks. Minutes print (or save as
PDF) straight away or later from Meeting History.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

The app needs an internet connection: Supabase, transcription and the AI
features are online services. Recordings made without internet can be saved to
the device and uploaded later from the meeting.

## Database

See [supabase/README.md](supabase/README.md). In short:

```bash
npm run db:backup           # logical backup (data, functions, policies)
npm run db:verify:pending   # dry-run pending migrations + RLS checks (rolled back)
npm run db:push             # apply pending migrations
npm run db:verify           # RLS checks against the live schema (rolled back)
npm run db:seed             # demo accounts and data
npm run db:seed:scenario    # the panel demo scenario (docs/demo-scenario.md)
```

## Demo accounts

| Role | Email |
|---|---|
| System Administrator | `admin@zppsu.edu.ph` |
| Department Head | `president@zppsu.edu.ph` |
| Faculty Secretary | `secretary@zppsu.edu.ph` |
| Faculty | `faculty@zppsu.edu.ph` |

Passwords are set through `DEMO_PASSWORD_*` in `.env.local` and are never
stored in the repository. New self-registrations start inactive and need an
administrator's approval (Admin → User Management).

## Checks

```bash
npm run types && npm run lint && npm test
```

More context for contributors: [CLAUDE.md](CLAUDE.md).
