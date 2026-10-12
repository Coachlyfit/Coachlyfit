-- 20260907000001 assumed admin/service_role "bypass RLS/triggers entirely
-- as usual". They bypass RLS, not triggers: the 7-day lock also fired on
-- FK cascades, so deleting any account (or coach) owning a log older than
-- a week failed with 42501. Restrict the lock to what it was written for:
-- a signed-in client rewriting their own history. Callers with no JWT
-- (Auth Admin API, service_role, SQL editor) and non-client callers pass.
create or replace function private.reject_stale_client_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Nested rather than `or`: private.client_id() isn't executable by every
  -- role that can reach this trigger via a cascade (e.g. supabase_auth_admin).
  if (select auth.uid()) is not null then
    if private.client_id() is not null
       and old.completed_at is not null
       and old.completed_at < now() - interval '7 days' then
      raise exception 'This entry is more than 7 days old and can no longer be changed.'
        using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function private.reject_stale_checkin_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if private.client_id() is not null
       and old.created_at < now() - interval '7 days' then
      raise exception 'This check-in is more than 7 days old and can no longer be changed.'
        using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
