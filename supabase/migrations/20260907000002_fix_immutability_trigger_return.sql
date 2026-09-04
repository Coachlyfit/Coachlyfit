-- Bug in 20260907000001: a BEFORE trigger that returns OLD instead of NEW
-- silently suppresses the write rather than letting it through -- so every
-- update (not just stale ones) was a silent no-op, and the reject-when-
-- stale branch never actually got exercised by a real write either. NEW is
-- null on DELETE, hence coalesce(new, old) rather than a bare `return new`.
create or replace function private.reject_stale_client_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.completed_at is not null and old.completed_at < now() - interval '7 days' then
    raise exception 'This entry is more than 7 days old and can no longer be changed.'
      using errcode = '42501';
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
  if old.created_at < now() - interval '7 days' then
    raise exception 'This check-in is more than 7 days old and can no longer be changed.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
