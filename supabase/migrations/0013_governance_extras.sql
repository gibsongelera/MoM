-- Governance extras for the app UI:
--   minutes.versions : snapshot history (versioning / diff, rec #13)
--   minutes.motions  : motions + roll-call vote tallies (rec #8)
-- Both additive jsonb; nothing existing is altered.

alter table minutes
  add column if not exists versions jsonb not null default '[]'::jsonb;
alter table minutes
  add column if not exists motions jsonb not null default '[]'::jsonb;
