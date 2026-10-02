-- ============================================================================
-- amend_minutes() must also carry the edited document body.
--
-- minutes_update's RLS policy (0002_rls.sql) requires locked_at is null, so a
-- plain client-side `.update()` on a locked document is silently accepted by
-- PostgREST (0 rows matched, no error surfaced without .select()) but writes
-- nothing. The mom-editor "amend" flow saves the edited call_to_order /
-- previous_minutes / agenda_items / adjournment via a direct table update
-- before calling amend_minutes() to clear the lock - on a locked document
-- that save silently no-ops and the edits are lost. Folding the body write
-- into this SECURITY DEFINER function (same trick lock_minutes/sign_minutes
-- already use to touch a locked row) makes the whole amend a single atomic,
-- successful write.
-- ============================================================================

-- Adding parameters changes the function's identity (name + arg types), so
-- CREATE OR REPLACE would leave the old 2-arg overload behind rather than
-- replacing it. Drop it explicitly first.
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

grant execute on function amend_minutes(uuid, text, text, text, jsonb, text) to authenticated;
