-- ============================================================================
-- Close a privilege-escalation hole in profiles.
--
-- ## The bug
--
-- profiles_update_self authorises the ROW ("id = auth.uid()") but says nothing
-- about which COLUMNS may change, and RLS cannot express column-level rules.
-- So any signed-in user could run:
--
--   update profiles set role = 'admin' where id = auth.uid();
--
-- and promote themselves. That is not a cosmetic issue: sm_is_admin() then
-- returns true, which unlocks every meeting in the university, the full audit
-- log, and user management. The same call could also null out department_id to
-- slip out of departmental scoping, or flip `active` back on after an admin
-- deactivated the account.
--
-- Caught by scripts/verify-rls.mjs, which queries as a real faculty session.
-- No UI review would have found it — the profile page never renders a role
-- field, but the table was reachable directly with the publishable key.
--
-- ## The fix
--
-- A BEFORE UPDATE trigger, which is the right tool for per-column authorisation.
-- Column-level GRANTs cannot work here because admins are also `authenticated`,
-- so a REVOKE would lock them out too.
-- ============================================================================

create or replace function guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  /*
   * auth.uid() is null for the service-role key and for direct psql
   * connections — that is the seed script and migrations, which legitimately
   * assign roles. Anonymous requests never reach here: every profiles policy
   * requires `authenticated`.
   */
  if auth.uid() is null or sm_is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only an administrator can change a user role'
      using errcode = '42501';
  end if;

  if new.department_id is distinct from old.department_id then
    raise exception 'Only an administrator can reassign a department'
      using errcode = '42501';
  end if;

  if new.active is distinct from old.active then
    raise exception 'Only an administrator can activate or deactivate an account'
      using errcode = '42501';
  end if;

  -- Identity columns are owned by Supabase Auth, not by this table.
  if new.id is distinct from old.id then
    raise exception 'Profile id is immutable' using errcode = '42501';
  end if;

  if new.email is distinct from old.email then
    raise exception 'Change your email through account settings, not the profile row'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileges
  before update on profiles
  for each row execute function guard_profile_privileges();
