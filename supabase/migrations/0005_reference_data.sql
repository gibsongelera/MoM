-- ============================================================================
-- Reference data
--
-- Departments, meeting sub-types and the settings row: everything that has no
-- dependency on a user id. Demo accounts and their meetings/transcripts/minutes
-- come from scripts/seed-demo.mjs, which has to create auth users first.
--
-- Written to be idempotent so re-running a migration is harmless.
-- ============================================================================

insert into departments (name, short, type, office_location) values
  ('College of Information & Computing Sciences', 'CICS', 'college', 'Bldg A, 4F'),
  ('College of Engineering & Technology',         'CET',  'college', 'Bldg B, 2F'),
  ('College of Business Administration',          'CBA',  'college', 'Bldg C, 3F'),
  ('College of Teacher Education',                'CTE',  'college', 'Bldg D, 1F'),
  ('College of Education',                        'COE',  'college', 'Bldg D, 2F'),
  ('ICT Management Office',                       'ICT',  'office',  'Admin Bldg, GF'),
  ('Office of Academic Affairs',                  'OAA',  'office',  'Admin Bldg, 2F'),
  ('Office of the University President',          'OUP',  'office',  'Admin Bldg, 3F')
on conflict (short) do nothing;

-- Capstone and research defence stages, in the order the UI lists them.
insert into meeting_subtypes (meeting_type, label, position) values
  ('capstone', 'Title Proposal',     1),
  ('capstone', 'Pre-Oral',           2),
  ('capstone', 'Mock Defense',       3),
  ('capstone', 'Final Presentation', 4),
  ('capstone', 'Other',              5),
  ('research', 'Proposal',           1),
  ('research', 'Progress',           2),
  ('research', 'Final',              3)
on conflict (meeting_type, label) do nothing;

-- Single settings row.
--
-- local_processing_only defaults to false now: summarisation runs against the
-- Claude API, so the legacy "no data leaves the device" badge would be a false
-- claim. Transcription is still in-browser via the Web Speech API, and the
-- offline fallback summariser is fully local.
insert into app_settings (id) values (true)
on conflict (id) do nothing;
