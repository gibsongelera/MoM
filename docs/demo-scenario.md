# Panel demo scenario (capstone defense)

The panel asked for one scenario where everything works end to end
("gagawa kayo ng isang scenario … gagana lahat"). This is it.

## Before the demo

1. `npm run db:seed` — base accounts and departments, if not done already.
2. `npm run db:seed:scenario` — adds the scenario below (safe to re-run).
3. `npm run dev`, then open http://localhost:3000.
4. Have the demo passwords ready (they live in `.env.local`, not in the repo).

The scenario adds three CICS meetings:

| Meeting | When | State |
|---|---|---|
| Capstone Mock Defense — Group 3 | Oct 1, 2:00 PM | Done: attendance, transcript, approved and signed minutes, panel notes |
| Capstone Final Presentation — Group 3 | **Oct 8, 2:00 PM** | Scheduled (shows on everyone's calendar) |
| Emergency meeting — Class suspension advisory | Oct 2, 4:30 PM | Minutes waiting for the head's approval |

## Walkthrough (about 10 minutes)

1. **Secretary → Meetings.** Show today/upcoming and recent meetings. The Final
   Presentation shows its typed chairperson ("Dr. Lorna Villanueva", no
   account), a panelist from another college (linked account) and an external
   panelist (typed), plus a guest observer.
2. **New meeting.** Pick *Capstone*, type a chairperson, add a third panel
   member with "Add panel member", tick participants with accounts, and add
   "someone without an account". Save → the meeting opens immediately and
   the participants are notified (bell; email if configured).
3. **Calendar.** The new meeting is already on the calendar — no separate
   announcement step. Sign in as faculty to show it on their calendar and in
   their notifications.
4. **Start emergency meeting** (sidebar). Title is prefilled; it starts now and
   goes straight to recording.
5. **Record → Stop and save.** You land on **Attendance** while it transcribes
   in the background. The list is built from the meeting: head, chairperson,
   panel, adviser, participants, guests. Mark present, sign (draw or type a
   name), add a walk-in. Quorum updates live.
6. **Attachments.** Attach a photo of the paper attendance sheet (and the
   panel's handwritten notes).
7. **Offline.** Turn Wi-Fi off and record: when you stop, the recording is kept
   with *Save recording to this device* / *Retry upload* — nothing is lost.
   Upload later from the meeting (*Record or upload* step). AI needs internet.
8. **Minutes.** Open the editor: it follows the CHED format (AO No. 06,
   s. 2014 — I. Preliminaries … V. Adjournment) on the ZPPSU + CHED
   letterhead. *Read with AI* on the panel-notes photo → the text appears
   under "Panel notes (from paper)"; the photo stays as evidence. *Save draft*
   → **PDF / Word / Print now / Later** — the PDF and Word files match the
   printed copy.
9. **Head → Approvals.** The emergency meeting is waiting. *Review and sign* →
   *Read the minutes* → sign → approved and locked. Print again: the DRAFT mark
   is gone and the head's signature is on it.
10. **Meeting History.** Filter by Capstone; print or download (PDF / Word)
    the Mock Defense minutes (attendance, panel, signatures, annexes).
11. **Faculty.** Sign in as faculty: the dashboard offers *Upload or record a
    meeting*; open **My Meetings** → a meeting → *Add my own recording*
    (private transcript, never the official record). **Personal Meetings**
    has add / edit / archive / delete and per-entry transcripts.
12. **Assistant.** The round button (bottom right, every page) answers from
    what the signed-in user can see — on a meeting page, about that meeting.

## If something goes wrong

- *"Minutes are approved by …" missing / wrong head*: the department's head is
  set in **Admin → Departments** (`departments.head_id`).
- *Emails don't arrive*: seeded `@zppsu.edu.ph` addresses receive no mail. Link
  one demo account to a real inbox and set `BREVO_API_KEY` + `SMTP_FROM`.
- *Transcription stuck*: the meeting page shows the job's status; failed jobs
  say so. Upload the audio again from the meeting. The dev-server log has one
  `[asr] …` line per step (submit, sync_started, job_completed, minutes_drafted).
- *"No speech-to-text webhooks are configured"*: no longer blocks uploads —
  SmartMin transcribes directly when no webhook is registered (or on localhost).
