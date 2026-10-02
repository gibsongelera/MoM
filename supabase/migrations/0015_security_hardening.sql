-- ============================================================================
-- 0015 — Security hardening.
--
-- Closes holes found in the Oct 2026 baseline audit:
--
--   1. Self-registration privilege escalation. handle_new_user() copied `role`
--      and `active` straight from client-supplied sign-up metadata, so anyone
--      could sign up as an active admin with the publishable key.
--   2. profiles.active was never enforced server-side. An inactive ("pending")
--      admin was already a full admin under RLS.
--   3. Forgeable approvals. minutes_update let any editor rewrite signatures,
--      status and lock columns directly; sign_minutes() trusted a caller-chosen
--      role label and signed locked documents.
--   4. Every function was executable by `anon` (Supabase's default grants were
--      never revoked), and notify_user() let any signed-in user notify anyone
--      with any text.
--   5. schema_migrations had no RLS.
--
-- Guard triggers below key off `current_user`: a direct PostgREST write runs as
-- `authenticated`, while the workflow RPCs are SECURITY DEFINER and run as their
-- owner, and the webhook/seed run as `service_role`. So the guards stop forged
-- client writes without getting in the way of the sanctioned paths.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 5. Migration bookkeeping is nobody's business but the migrator's.
-- ---------------------------------------------------------------------------
alter table if exists public.schema_migrations enable row level security;
revoke all on table public.schema_migrations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Active-aware caller identity.
--
-- An inactive account resolves to no role and no department, so every policy
-- built on these helpers denies it. Rows keyed on auth.uid() alone (own profile,
-- own notifications) stay readable so the UI can explain "pending approval".
-- ---------------------------------------------------------------------------
create or replace function sm_is_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select active from profiles where id = auth.uid()), false);
$$;

create or replace function sm_role()
returns user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from profiles where id = auth.uid() and active;
$$;

create or replace function sm_department()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select department_id from profiles where id = auth.uid() and active;
$$;

create or replace function sm_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select role from profiles where id = auth.uid() and active) = 'admin', false);
$$;

-- Editing rights now also require an active account (an inactive secretary
-- would otherwise still pass through m.secretary_id = auth.uid()).
create or replace function sm_can_edit_meeting_docs(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sm_is_active() and exists (
    select 1
    from meetings m
    where m.id = p_meeting_id
      and (
        sm_is_admin()
        or m.secretary_id = auth.uid()
        or m.chair_id = auth.uid()
        or (sm_role() in ('head', 'secretary') and m.department_id = sm_department())
      )
  );
$$;

-- The approving head of a department: departments.head_id when that account is
-- active, otherwise the first active head-role profile in the department.
create or replace function sm_department_head(p_department_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select d.head_id
       from departments d
       join profiles p on p.id = d.head_id and p.active
      where d.id = p_department_id),
    (select p.id
       from profiles p
      where p.department_id = p_department_id and p.role = 'head' and p.active
      order by p.created_at
      limit 1)
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. Sign-ups are always pending faculty. The requested role is recorded for an
--    administrator to review; it grants nothing by itself.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists requested_role user_role;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw text := nullif(new.raw_user_meta_data ->> 'department_id', '');
  v_requested text := new.raw_user_meta_data ->> 'role';
  v_dept uuid;
begin
  if v_raw is not null then
    select id into v_dept
    from departments
    where id = sm_uuid_or_null(v_raw) or short = upper(v_raw)
    limit 1;
  end if;

  insert into profiles (id, name, email, role, requested_role, department_id, position, active, joined_at)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email,
    'faculty',
    case when v_requested in ('admin', 'head', 'secretary', 'faculty')
         then v_requested::user_role end,
    v_dept,
    nullif(new.raw_user_meta_data ->> 'position', ''),
    false,
    current_date
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Role / activation changes are audited by the database, not the client.
create or replace function audit_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role then
    perform log_audit('user_role_changed', new.email || ': ' || old.role || ' -> ' || new.role);
  end if;
  if new.active is distinct from old.active then
    perform log_audit(case when new.active then 'user_activated' else 'user_deactivated' end, new.email);
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_audit_privileges on profiles;
create trigger profiles_audit_privileges
  after update of role, active on profiles
  for each row execute function audit_profile_privileges();

-- Departments for the signed-out register form, without exposing the table.
create or replace function list_departments_public()
returns table (id uuid, name text, short text, type department_type)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.name, d.short, d.type from departments d order by d.type, d.name;
$$;

-- ---------------------------------------------------------------------------
-- 3a. Minutes: workflow columns are writable only through the RPCs.
-- SECURITY INVOKER on purpose: current_user must reflect who issued the write.
-- ---------------------------------------------------------------------------
create or replace function guard_minutes_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.signatures := '[]'::jsonb;
    new.comments := '[]'::jsonb;
    new.amendments := '[]'::jsonb;
    new.status := 'draft';
    new.locked_at := null;
    new.locked_by := null;
    return new;
  end if;

  if new.signatures is distinct from old.signatures
     or new.status is distinct from old.status
     or new.locked_at is distinct from old.locked_at
     or new.locked_by is distinct from old.locked_by
     or new.amendments is distinct from old.amendments
     or new.comments is distinct from old.comments
     or new.meeting_id is distinct from old.meeting_id then
    raise exception 'Signatures, approval status and comments can only change through the approval workflow'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists minutes_guard_columns on minutes;
create trigger minutes_guard_columns
  before insert or update on minutes
  for each row execute function guard_minutes_columns();

-- Transcript comments carry an author; they go through append_transcript_comment().
create or replace function guard_transcript_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' and new.comments is distinct from old.comments then
    raise exception 'Comments can only be added through append_transcript_comment()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists transcripts_guard_columns on transcripts;
create trigger transcripts_guard_columns
  before update on transcripts
  for each row execute function guard_transcript_columns();

-- ---------------------------------------------------------------------------
-- 3b. Meetings: the approving chair is the department head, and approval status
-- is never set directly.
-- ---------------------------------------------------------------------------
create or replace function guard_meeting_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Every caller (seed included) gets the department head as the approving
  -- chair when none was given — without it, routing/approval notifications go
  -- nowhere and the head's signature never renders.
  if tg_op = 'INSERT' and new.chair_id is null then
    new.chair_id := sm_department_head(new.department_id);
  end if;

  if current_user <> 'authenticated' or sm_is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.department_id is distinct from old.department_id then
      raise exception 'A meeting cannot be moved to another department' using errcode = '42501';
    end if;
    if new.secretary_id is distinct from old.secretary_id and sm_role() is distinct from 'head' then
      raise exception 'Only the department head can reassign the meeting secretary' using errcode = '42501';
    end if;
  elsif new.secretary_id is not null and new.secretary_id <> auth.uid() and sm_role() is distinct from 'head' then
    raise exception 'You can only schedule meetings as their secretary' using errcode = '42501';
  end if;

  if new.chair_id is not null
     and (tg_op = 'INSERT' or new.chair_id is distinct from old.chair_id)
     and new.chair_id is distinct from sm_department_head(new.department_id) then
    raise exception 'The approving chair must be the department head' using errcode = '42501';
  end if;

  if new.status in ('pending_approval', 'approved')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    raise exception 'Approval status changes go through the minutes workflow' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists meetings_guard_columns on meetings;
create trigger meetings_guard_columns
  before insert or update on meetings
  for each row execute function guard_meeting_columns();

-- ---------------------------------------------------------------------------
-- 3c. Signing. The signer's capacity is derived on the server; the caller's
-- label is ignored (kept in the signature only for backward compatibility).
-- ---------------------------------------------------------------------------
create or replace function sign_minutes(
  p_minutes_id uuid,
  p_role_label text,
  p_data_url text default null
)
returns minutes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row minutes;
  v_meeting meetings;
  v_locked timestamptz;
  v_name text;
  v_is_approver boolean;
  v_kind text;
  v_label text;
  v_sig jsonb;
  v_kept jsonb;
begin
  select m.* into v_meeting
  from meetings m
  where m.id = (select meeting_id from minutes where id = p_minutes_id);

  if v_meeting.id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not sm_can_edit_meeting_docs(v_meeting.id) then
    raise exception 'Not permitted to sign these minutes' using errcode = '42501';
  end if;

  select locked_at into v_locked from minutes where id = p_minutes_id;
  if v_locked is not null then
    raise exception 'These minutes are locked. Amend them before signing again.' using errcode = '42501';
  end if;

  if p_data_url is not null and p_data_url <> ''
     and (p_data_url !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(p_data_url) > 400000) then
    raise exception 'Signature must be a PNG image under 300 KB' using errcode = '22023';
  end if;

  v_is_approver := sm_is_admin()
    or v_meeting.chair_id = auth.uid()
    or (sm_role() = 'head' and v_meeting.department_id = sm_department());
  v_kind := case when v_is_approver then 'approver' else 'secretary' end;
  v_label := case
    when v_is_approver and sm_role() = 'admin' and v_meeting.chair_id is distinct from auth.uid() then 'Administrator'
    when v_is_approver then 'Head'
    else 'Faculty Secretary'
  end;

  select name into v_name from profiles where id = auth.uid();

  v_sig := jsonb_build_object(
    'userId', auth.uid(),
    'name', coalesce(v_name, 'Unknown'),
    'role', v_label,
    'kind', v_kind,
    'signedAt', (extract(epoch from now()) * 1000)::bigint,
    'dataUrl', coalesce(p_data_url, '')
  );

  select coalesce(jsonb_agg(sig), '[]'::jsonb)
    into v_kept
  from jsonb_array_elements((select signatures from minutes where id = p_minutes_id)) sig
  where coalesce(sig ->> 'userId', '') <> auth.uid()::text;

  update minutes
  set signatures = v_kept || jsonb_build_array(v_sig)
  where id = p_minutes_id
  returning * into v_row;

  perform log_audit('minutes_signed', v_label || ' signed minutes ' || p_minutes_id);

  return v_row;
end;
$$;

-- Sign as approver and lock in one transaction, so a signed document is never
-- left unlocked (ApprovalsList used to do this in two client round-trips).
create or replace function approve_minutes(p_minutes_id uuid, p_data_url text)
returns minutes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meeting meetings;
begin
  select m.* into v_meeting
  from meetings m
  where m.id = (select meeting_id from minutes where id = p_minutes_id);

  if v_meeting.id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not (
    sm_is_admin()
    or v_meeting.chair_id = auth.uid()
    or (sm_role() = 'head' and v_meeting.department_id = sm_department())
  ) then
    raise exception 'Only the department head or an administrator can approve these minutes'
      using errcode = '42501';
  end if;

  perform sign_minutes(p_minutes_id, 'Head', p_data_url);
  return lock_minutes(p_minutes_id);
end;
$$;

-- Amending drops the approver's signature. New signatures carry kind='approver';
-- older rows only have a role label, matched as before.
drop function if exists amend_minutes(uuid, text);

create or replace function amend_minutes(
  p_minutes_id uuid,
  p_summary text default null,
  p_call_to_order text default null,
  p_previous_minutes text default null,
  p_agenda_items jsonb default null,
  p_adjournment text default null
)
returns minutes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row minutes;
  v_meeting meetings;
  v_name text;
  v_amendment jsonb;
  v_kept jsonb;
begin
  select * into v_meeting
  from meetings
  where id = (select meeting_id from minutes where id = p_minutes_id);

  if v_meeting.id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not sm_can_edit_meeting_docs(v_meeting.id) then
    raise exception 'Not permitted to amend these minutes' using errcode = '42501';
  end if;

  select name into v_name from profiles where id = auth.uid();

  v_amendment := jsonb_build_object(
    'ts', (extract(epoch from now()) * 1000)::bigint,
    'byUserId', auth.uid(),
    'byName', coalesce(v_name, 'Anonymous'),
    'summary', coalesce(nullif(btrim(p_summary), ''), 'Minutes amended after lock')
  );

  select coalesce(jsonb_agg(sig), '[]'::jsonb)
    into v_kept
  from jsonb_array_elements((select signatures from minutes where id = p_minutes_id)) sig
  where coalesce(sig ->> 'kind', '') <> 'approver'
    and (sig ? 'kind' or coalesce(sig ->> 'role', '') !~* '(dean|chair|head|president|administrator)');

  update minutes
  set signatures = v_kept,
      locked_at = null,
      locked_by = null,
      status = 'pending_approval',
      amendments = amendments || jsonb_build_array(v_amendment),
      call_to_order = coalesce(p_call_to_order, call_to_order),
      previous_minutes = coalesce(p_previous_minutes, previous_minutes),
      agenda_items = coalesce(p_agenda_items, agenda_items),
      adjournment = coalesce(p_adjournment, adjournment)
  where id = p_minutes_id
  returning * into v_row;

  update meetings set status = 'pending_approval' where id = v_meeting.id;

  perform log_audit('minutes_amended',
                    'Amended after lock: ' || coalesce(v_row.document_title, v_meeting.title));

  if v_meeting.chair_id is not null then
    perform notify_user(v_meeting.chair_id, 'approval', 'Minutes require re-approval',
                        coalesce(v_row.document_title, v_meeting.title) ||
                        ' was amended after approval and needs your signature again.');
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Function privileges.
--
-- Supabase grants EXECUTE on every new public function to anon. Take that away
-- wholesale, then keep `authenticated` only on what the app calls (its default
-- grant stays in place for the RLS helpers policies evaluate). notify_user and
-- log_audit become internal: the workflow functions call them as owner, and the
-- webhook calls log_audit as service_role.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

revoke execute on function notify_user(uuid, text, text, text) from authenticated;
revoke execute on function log_audit(text, text) from authenticated;
grant execute on function notify_user(uuid, text, text, text) to service_role;
grant execute on function log_audit(text, text) to service_role;

grant execute on function sm_is_active() to authenticated;
grant execute on function sm_department_head(uuid) to authenticated;
grant execute on function sign_minutes(uuid, text, text) to authenticated;
grant execute on function approve_minutes(uuid, text) to authenticated;
grant execute on function amend_minutes(uuid, text, text, text, jsonb, text) to authenticated;
grant execute on function list_departments_public() to anon, authenticated;

notify pgrst, 'reload schema';
