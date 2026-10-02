-- ============================================================================
-- 0016 — Meeting people: guests, typed chairperson / panel / adviser,
-- emergency meetings, one visibility rule, participant sync, notifications.
--
-- Client requests (Oct 2026 panel review):
--   * participants without an account can be added by typing their name;
--   * capstone chairperson and panel members are typed (external panelists,
--     other colleges), optionally linked to an account;
--   * unscheduled ("biglaan") emergency meetings alongside scheduled ones;
--   * scheduled meetings notify the people on them.
--
-- The existing chairperson_id / panel_member_ids / adviser_id columns stay as
-- the "linked account" half (the editor, transcribe route and webhook read
-- them); the new name columns are the source of truth for display, and a
-- trigger keeps the two in step.
-- ============================================================================

alter table meetings add column if not exists is_emergency boolean not null default false;
alter table meetings add column if not exists guests jsonb not null default '[]'::jsonb;
alter table meetings add column if not exists chairperson_name text;
alter table meetings add column if not exists panel_members jsonb not null default '[]'::jsonb;
alter table meetings add column if not exists adviser_name text;

alter table meetings drop constraint if exists meetings_guests_is_array;
alter table meetings add constraint meetings_guests_is_array
  check (jsonb_typeof(guests) = 'array' and jsonb_array_length(guests) <= 100);

alter table meetings drop constraint if exists meetings_panel_members_is_array;
alter table meetings add constraint meetings_panel_members_is_array
  check (jsonb_typeof(panel_members) = 'array' and jsonb_array_length(panel_members) <= 12);

alter table meetings drop constraint if exists meetings_people_names_length;
alter table meetings add constraint meetings_people_names_length
  check (coalesce(length(chairperson_name), 0) <= 120 and coalesce(length(adviser_name), 0) <= 120);

-- Notifications can point at the meeting they are about, so the bell can link
-- each recipient to the right page for their role.
alter table notifications add column if not exists meeting_id uuid references meetings (id) on delete cascade;

-- Backfill display names for meetings created before this migration.
update meetings m
set chairperson_name = p.name
from profiles p
where m.chairperson_id = p.id and m.chairperson_name is null;

update meetings m
set adviser_name = p.name
from profiles p
where m.adviser_id = p.id and m.adviser_name is null;

update meetings m
set panel_members = coalesce((
  select jsonb_agg(jsonb_build_object('name', p.name, 'userId', p.id) order by p.name)
  from profiles p
  where p.id = any (m.panel_member_ids)
), '[]'::jsonb)
where cardinality(m.panel_member_ids) > 0 and m.panel_members = '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- One meeting visibility rule, evaluated on the row itself.
--
-- The old sm_can_see_meeting(id) re-read `meetings`, which a STABLE function
-- cannot see during INSERT ... RETURNING (the new row is invisible to its
-- snapshot), and it only let *faculty* see meetings they were invited to — a
-- head or secretary from another college sitting on a capstone panel could
-- not open the meeting at all.
-- ---------------------------------------------------------------------------
create or replace function sm_can_see_meeting_row(
  p_id uuid,
  p_department_id uuid,
  p_secretary_id uuid,
  p_chair_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sm_is_active() and (
    sm_is_admin()
    or p_department_id = sm_department()
    or p_secretary_id = auth.uid()
    or p_chair_id = auth.uid()
    or sm_is_participant(p_id)
  );
$$;

create or replace function sm_can_see_meeting(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from meetings m
    where m.id = p_meeting_id
      and sm_can_see_meeting_row(m.id, m.department_id, m.secretary_id, m.chair_id)
  );
$$;

drop policy if exists meetings_select on meetings;
create policy meetings_select on meetings
  for select to authenticated
  using (sm_can_see_meeting_row(id, department_id, secretary_id, chair_id));

-- ---------------------------------------------------------------------------
-- Keep the linked-account columns in step with the typed people.
-- Also validates the jsonb shapes the UI writes.
-- ---------------------------------------------------------------------------
create or replace function sync_meeting_people()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elem jsonb;
begin
  for v_elem in select * from jsonb_array_elements(new.guests) loop
    if jsonb_typeof(v_elem) <> 'object'
       or coalesce(btrim(v_elem ->> 'name'), '') = ''
       or length(v_elem ->> 'name') > 120 then
      raise exception 'Each guest needs a name (up to 120 characters)' using errcode = '22023';
    end if;
  end loop;

  for v_elem in select * from jsonb_array_elements(new.panel_members) loop
    if jsonb_typeof(v_elem) <> 'object'
       or coalesce(btrim(v_elem ->> 'name'), '') = ''
       or length(v_elem ->> 'name') > 120 then
      raise exception 'Each panel member needs a name (up to 120 characters)' using errcode = '22023';
    end if;
  end loop;

  if jsonb_array_length(new.panel_members) > 0 then
    new.panel_member_ids := coalesce((
      select array_agg(distinct u)
      from (
        select sm_uuid_or_null(e ->> 'userId') as u
        from jsonb_array_elements(new.panel_members) e
      ) x
      where u is not null and exists (select 1 from profiles p where p.id = u)
    ), '{}');
  elsif tg_op = 'UPDATE' and old.panel_members <> '[]'::jsonb then
    new.panel_member_ids := '{}';
  elsif cardinality(new.panel_member_ids) > 0 then
    new.panel_members := coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'userId', p.id) order by p.name)
      from profiles p where p.id = any (new.panel_member_ids)
    ), '[]'::jsonb);
  end if;

  if new.chairperson_id is not null and nullif(btrim(new.chairperson_name), '') is null then
    select name into new.chairperson_name from profiles where id = new.chairperson_id;
  end if;
  if new.adviser_id is not null and nullif(btrim(new.adviser_name), '') is null then
    select name into new.adviser_name from profiles where id = new.adviser_id;
  end if;

  new.chairperson_name := nullif(btrim(new.chairperson_name), '');
  new.adviser_name := nullif(btrim(new.adviser_name), '');
  return new;
end;
$$;

drop trigger if exists meetings_sync_people on meetings;
create trigger meetings_sync_people
  before insert or update on meetings
  for each row execute function sync_meeting_people();

-- Linked accounts in a role (approving chair, panel chair, panel, adviser) are
-- participants: they can see the meeting and they get its notifications.
create or replace function add_meeting_role_participants()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into meeting_participants (meeting_id, user_id)
  select new.id, u
  from unnest(array[new.chair_id, new.chairperson_id, new.adviser_id] || new.panel_member_ids) as u
  where u is not null
  on conflict do nothing;
  return null;
end;
$$;

drop trigger if exists meetings_add_role_participants on meetings;
create trigger meetings_add_role_participants
  after insert or update of chair_id, chairperson_id, adviser_id, panel_member_ids on meetings
  for each row execute function add_meeting_role_participants();

-- ---------------------------------------------------------------------------
-- Notifications. Raised by the database so they cannot be skipped or forged.
-- Skipped when there is no signed-in actor (seed scripts, migrations).
-- ---------------------------------------------------------------------------
create or replace function sm_fmt_meeting_time(p_ts timestamptz)
returns text
language sql
stable
as $$
  select to_char(p_ts at time zone 'Asia/Manila', 'Mon FMDD, YYYY "at" FMHH12:MI AM');
$$;

create or replace function notify_new_participant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m meetings;
begin
  if auth.uid() is null or new.user_id = auth.uid() then
    return null;
  end if;

  select * into v_m from meetings where id = new.meeting_id;
  if v_m.id is null then
    return null;
  end if;

  insert into notifications (user_id, type, title, body, meeting_id)
  values (
    new.user_id,
    'meeting_invite',
    case when v_m.is_emergency then 'Emergency meeting now' else 'You''re invited to a meeting' end,
    v_m.title || ' — ' || sm_fmt_meeting_time(v_m.starts_at) || coalesce(' · ' || nullif(v_m.venue, ''), ''),
    v_m.id
  );
  return null;
end;
$$;

drop trigger if exists meeting_participants_notify on meeting_participants;
create trigger meeting_participants_notify
  after insert on meeting_participants
  for each row execute function notify_new_participant();

create or replace function notify_meeting_rescheduled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  if new.starts_at is not distinct from old.starts_at and new.venue is not distinct from old.venue then
    return null;
  end if;

  insert into notifications (user_id, type, title, body, meeting_id)
  select mp.user_id,
         'meeting_update',
         'Meeting rescheduled',
         new.title || ' — now ' || sm_fmt_meeting_time(new.starts_at) || coalesce(' · ' || nullif(new.venue, ''), ''),
         new.id
  from meeting_participants mp
  where mp.meeting_id = new.id and mp.user_id <> auth.uid();
  return null;
end;
$$;

drop trigger if exists meetings_notify_rescheduled on meetings;
create trigger meetings_notify_rescheduled
  after update of starts_at, venue on meetings
  for each row execute function notify_meeting_rescheduled();

-- ---------------------------------------------------------------------------
-- People search for the chairperson / panel / participant pickers.
-- Cross-department on purpose (external panelists), so it is a definer
-- function returning only directory fields, to staff only, with a minimum
-- query length and a hard row cap.
-- ---------------------------------------------------------------------------
create or replace function search_people(p_query text, p_limit int default 10)
returns table (id uuid, name text, "position" text, role user_role, department_short text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.name, p.position, p.role, d.short
  from profiles p
  left join departments d on d.id = p.department_id
  where sm_role() in ('admin', 'head', 'secretary')
    and p.active
    and length(btrim(coalesce(p_query, ''))) >= 2
    and p.name ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by p.name
  limit least(greatest(coalesce(p_limit, 10), 1), 20);
$$;

revoke execute on function sm_can_see_meeting_row(uuid, uuid, uuid, uuid) from public, anon;
revoke execute on function search_people(text, int) from public, anon;
revoke execute on function sm_fmt_meeting_time(timestamptz) from public, anon;
grant execute on function sm_can_see_meeting_row(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function search_people(text, int) to authenticated;

notify pgrst, 'reload schema';
