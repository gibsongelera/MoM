-- Phase 5 — participant RSVP on a meeting (accept/decline an invitation).
-- Faculty cannot UPDATE meetings under RLS, so RSVP goes through a SECURITY
-- DEFINER function gated on meeting visibility, like the comment RPCs.

alter table meetings add column if not exists rsvps jsonb not null default '{}'::jsonb;

create or replace function set_meeting_rsvp(p_meeting_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_status not in ('accepted', 'declined', 'invited') then
    raise exception 'Invalid RSVP status: %', p_status;
  end if;
  if not sm_can_see_meeting(p_meeting_id) then
    raise exception 'Not permitted to RSVP to this meeting';
  end if;

  update meetings
  set rsvps = coalesce(rsvps, '{}'::jsonb) || jsonb_build_object(auth.uid()::text, p_status)
  where id = p_meeting_id
  returning rsvps into v_result;

  return v_result;
end;
$$;

grant execute on function set_meeting_rsvp(uuid, text) to authenticated;
