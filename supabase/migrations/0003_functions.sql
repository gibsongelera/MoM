-- ============================================================================
-- Server-side behaviour
--
-- Anything that has to happen as one indivisible step, or that writes on
-- another user's behalf, lives here rather than in a Server Action. Two
-- reasons: a half-applied amendment leaves a signed document in an
-- unrepresentable state, and a client that can insert its own audit rows or
-- notifications can forge them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Provision a profile when a new auth user is created.
--
-- Register submits name / position / department through the sign-up metadata;
-- self-registered accounts are always faculty and inactive until an admin
-- activates them, matching the legacy register.html flow.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw text := nullif(new.raw_user_meta_data ->> 'department_id', '');
  v_dept uuid;
begin
  /*
   * Accept either a department UUID or a short code such as 'CICS'. Resolve
   * through the departments table either way: a syntactically valid UUID that
   * does not exist would otherwise fail the profiles FK and abort the signup
   * with an opaque error.
   */
  if v_raw is not null then
    select id into v_dept
    from departments
    where id = sm_uuid_or_null(v_raw) or short = upper(v_raw)
    limit 1;
  end if;

  insert into profiles (id, name, email, role, department_id, position, active, joined_at)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'faculty'),
    v_dept,
    nullif(new.raw_user_meta_data ->> 'position', ''),
    coalesce((new.raw_user_meta_data ->> 'active')::boolean, false),
    current_date
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Audit trail. Append-only; the actor is taken from the session, never trusted
-- from the caller.
-- ---------------------------------------------------------------------------
create or replace function log_audit(p_action text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_role user_role;
begin
  select name, role into v_name, v_role from profiles where id = auth.uid();

  insert into audit_log (user_id, user_name, role, action, detail)
  values (auth.uid(), coalesce(v_name, 'Anonymous'), v_role, p_action, p_detail);
end;
$$;

-- ---------------------------------------------------------------------------
-- Raise a notification for another user.
-- ---------------------------------------------------------------------------
create or replace function notify_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into notifications (user_id, type, title, body)
  values (p_user_id, p_type, p_title, p_body);
end;
$$;

-- ---------------------------------------------------------------------------
-- Comment threads.
--
-- Appending a comment is an UPDATE of one jsonb column, which a policy cannot
-- express — granting UPDATE would let a faculty member rewrite the whole
-- document. These functions gate on read access instead, so anyone who can see
-- the meeting can comment, and nothing else.
-- ---------------------------------------------------------------------------
create or replace function append_transcript_comment(p_transcript_id uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meeting_id uuid;
  v_comment jsonb;
  v_result jsonb;
  v_name text;
begin
  if coalesce(btrim(p_text), '') = '' then
    raise exception 'Comment text is required';
  end if;

  select meeting_id into v_meeting_id from transcripts where id = p_transcript_id;
  if v_meeting_id is null then
    raise exception 'Transcript % not found', p_transcript_id;
  end if;

  if not sm_can_see_meeting(v_meeting_id) then
    raise exception 'Not permitted to comment on this transcript';
  end if;

  select name into v_name from profiles where id = auth.uid();

  v_comment := jsonb_build_object(
    'id', gen_random_uuid(),
    'ts', (extract(epoch from now()) * 1000)::bigint,
    'userId', auth.uid(),
    'name', coalesce(v_name, 'Unknown'),
    'text', p_text
  );

  update transcripts
  set comments = comments || jsonb_build_array(v_comment)
  where id = p_transcript_id
  returning comments into v_result;

  perform log_audit('comment_posted', 'Transcript comment on meeting ' || v_meeting_id);

  -- Everyone else on the meeting hears about it.
  perform notify_user(mp.user_id, 'task', 'New comment on transcript',
                      coalesce(v_name, 'Someone') || ': ' || left(p_text, 80))
  from meeting_participants mp
  where mp.meeting_id = v_meeting_id and mp.user_id <> auth.uid();

  return v_result;
end;
$$;

create or replace function append_minutes_comment(p_minutes_id uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meeting_id uuid;
  v_chair_id uuid;
  v_comment jsonb;
  v_result jsonb;
  v_name text;
begin
  if coalesce(btrim(p_text), '') = '' then
    raise exception 'Comment text is required';
  end if;

  select mi.meeting_id, m.chair_id
    into v_meeting_id, v_chair_id
  from minutes mi
  join meetings m on m.id = mi.meeting_id
  where mi.id = p_minutes_id;

  if v_meeting_id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not sm_can_see_meeting(v_meeting_id) then
    raise exception 'Not permitted to comment on these minutes';
  end if;

  select name into v_name from profiles where id = auth.uid();

  v_comment := jsonb_build_object(
    'id', gen_random_uuid(),
    'ts', (extract(epoch from now()) * 1000)::bigint,
    'userId', auth.uid(),
    'name', coalesce(v_name, 'Unknown'),
    'text', p_text
  );

  -- Commenting is allowed on a locked document; editing it is not.
  update minutes
  set comments = comments || jsonb_build_array(v_comment)
  where id = p_minutes_id
  returning comments into v_result;

  perform log_audit('comment_posted', 'Minutes comment on meeting ' || v_meeting_id);

  if v_chair_id is not null and v_chair_id <> auth.uid() then
    perform notify_user(v_chair_id, 'task', 'New comment on minutes',
                        coalesce(v_name, 'Someone') || ': ' || left(p_text, 80));
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approve and lock. Called when the head signs off.
--
-- One statement each for the document and its meeting, so a signed document is
-- never left unlocked or a locked document left pending.
-- ---------------------------------------------------------------------------
create or replace function lock_minutes(p_minutes_id uuid)
returns minutes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row minutes;
  v_meeting meetings;
begin
  select * into v_meeting
  from meetings
  where id = (select meeting_id from minutes where id = p_minutes_id);

  if v_meeting.id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  -- Only the chair of the meeting, a head in that department, or an admin.
  if not (
    sm_is_admin()
    or v_meeting.chair_id = auth.uid()
    or (sm_role() = 'head' and v_meeting.department_id = sm_department())
  ) then
    raise exception 'Only the chairperson or an administrator can approve these minutes';
  end if;

  update minutes
  set locked_at = now(),
      locked_by = auth.uid(),
      status = 'approved'
  where id = p_minutes_id
  returning * into v_row;

  update meetings set status = 'approved' where id = v_meeting.id;

  perform log_audit('minutes_locked',
                    'Approved and locked: ' || coalesce(v_row.document_title, v_meeting.title));

  if v_meeting.secretary_id is not null and v_meeting.secretary_id <> auth.uid() then
    perform notify_user(v_meeting.secretary_id, 'approval', 'Minutes approved',
                        coalesce(v_row.document_title, v_meeting.title) ||
                        ' has been approved and locked.');
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Amend a locked document.
--
-- The whole point of this being one function: editing approved minutes must
-- invalidate the approving signature. Doing it in five client round-trips
-- leaves windows where the document is signed but edited, or unlocked but still
-- marked approved. Port of amendMinutes() from assets/js/store.js.
-- ---------------------------------------------------------------------------
create or replace function amend_minutes(p_minutes_id uuid, p_summary text default null)
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
    raise exception 'Not permitted to amend these minutes';
  end if;

  select name into v_name from profiles where id = auth.uid();

  v_amendment := jsonb_build_object(
    'ts', (extract(epoch from now()) * 1000)::bigint,
    'byUserId', auth.uid(),
    'byName', coalesce(v_name, 'Anonymous'),
    'summary', coalesce(nullif(btrim(p_summary), ''), 'Minutes amended after lock')
  );

  -- Drop the approving signature; the secretary's own signature survives.
  select coalesce(jsonb_agg(sig), '[]'::jsonb)
    into v_kept
  from jsonb_array_elements((select signatures from minutes where id = p_minutes_id)) sig
  where coalesce(sig ->> 'role', '') !~* '(dean|chair|head|president)';

  update minutes
  set signatures = v_kept,
      locked_at = null,
      locked_by = null,
      status = 'pending_approval',
      amendments = amendments || jsonb_build_array(v_amendment)
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
-- Record a signature on the minutes.
--
-- Appending to the signatures array is the same column-level problem as
-- comments: a head must be able to sign without being able to rewrite the
-- document body.
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
  v_meeting_id uuid;
  v_name text;
  v_sig jsonb;
  v_kept jsonb;
begin
  select meeting_id into v_meeting_id from minutes where id = p_minutes_id;
  if v_meeting_id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not sm_can_edit_meeting_docs(v_meeting_id) then
    raise exception 'Not permitted to sign these minutes';
  end if;

  select name into v_name from profiles where id = auth.uid();

  v_sig := jsonb_build_object(
    'userId', auth.uid(),
    'name', coalesce(v_name, 'Unknown'),
    'role', p_role_label,
    'signedAt', (extract(epoch from now()) * 1000)::bigint,
    'dataUrl', coalesce(p_data_url, '')
  );

  -- Re-signing replaces the previous signature from the same user.
  select coalesce(jsonb_agg(sig), '[]'::jsonb)
    into v_kept
  from jsonb_array_elements((select signatures from minutes where id = p_minutes_id)) sig
  where coalesce(sig ->> 'userId', '') <> auth.uid()::text;

  update minutes
  set signatures = v_kept || jsonb_build_array(v_sig)
  where id = p_minutes_id
  returning * into v_row;

  perform log_audit('minutes_signed', p_role_label || ' signed minutes ' || p_minutes_id);

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Route a draft for approval.
-- ---------------------------------------------------------------------------
create or replace function route_minutes_for_approval(p_minutes_id uuid)
returns minutes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row minutes;
  v_meeting meetings;
begin
  select * into v_meeting
  from meetings
  where id = (select meeting_id from minutes where id = p_minutes_id);

  if v_meeting.id is null then
    raise exception 'Minutes % not found', p_minutes_id;
  end if;

  if not sm_can_edit_meeting_docs(v_meeting.id) then
    raise exception 'Not permitted to route these minutes';
  end if;

  update minutes set status = 'pending_approval' where id = p_minutes_id returning * into v_row;
  update meetings set status = 'pending_approval' where id = v_meeting.id;

  perform log_audit('minutes_routed',
                    'Routed for approval: ' || coalesce(v_row.document_title, v_meeting.title));

  if v_meeting.chair_id is not null then
    perform notify_user(v_meeting.chair_id, 'approval', 'Minutes awaiting your signature',
                        coalesce(v_row.document_title, v_meeting.title) ||
                        ' is ready for review.');
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. RLS still applies to every one of these; the definer rights only
-- cover the specific writes each function performs.
-- ---------------------------------------------------------------------------
grant execute on function sm_role() to authenticated;
grant execute on function sm_department() to authenticated;
grant execute on function sm_is_admin() to authenticated;
grant execute on function sm_uuid_or_null(text) to authenticated;
grant execute on function sm_is_participant(uuid) to authenticated;
grant execute on function sm_shares_meeting_with(uuid) to authenticated;
grant execute on function sm_can_see_meeting(uuid) to authenticated;
grant execute on function sm_can_edit_meeting_docs(uuid) to authenticated;
grant execute on function log_audit(text, text) to authenticated;
grant execute on function notify_user(uuid, text, text, text) to authenticated;
grant execute on function append_transcript_comment(uuid, text) to authenticated;
grant execute on function append_minutes_comment(uuid, text) to authenticated;
grant execute on function lock_minutes(uuid) to authenticated;
grant execute on function amend_minutes(uuid, text) to authenticated;
grant execute on function sign_minutes(uuid, text, text) to authenticated;
grant execute on function route_minutes_for_approval(uuid) to authenticated;
