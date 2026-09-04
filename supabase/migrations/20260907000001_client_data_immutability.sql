-- Client-authored performance/self-report data (checkins, workout_set_logs)
-- has always been client_own for all -- a client can retroactively edit or
-- delete any past row indefinitely, including rows a coach's compliance
-- view has already read and acted on. Closes that window: a client can
-- still fix a mistake shortly after logging it, but not rewrite history a
-- coach may have already reviewed weeks later. The coach's own writes are
-- unaffected -- there are none (both tables are select-only for coach_read)
-- -- and admin/service_role bypass RLS/triggers entirely as usual.
create function private.reject_stale_client_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only the client path is restricted -- this fires on client_own's
  -- policy, which is the only way a non-privileged role reaches this
  -- trigger at all (coach_read has no write policy on either table).
  if old.completed_at is not null and old.completed_at < now() - interval '7 days' then
    raise exception 'This entry is more than 7 days old and can no longer be changed.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger workout_set_logs_reject_stale_edit
  before update or delete on public.workout_set_logs
  for each row execute function private.reject_stale_client_edit();

-- checkins has no completed_at column -- created_at is the equivalent
-- write timestamp, so a thin wrapper trigger reads that instead.
create function private.reject_stale_checkin_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.created_at < now() - interval '7 days' then
    raise exception 'This check-in is more than 7 days old and can no longer be changed.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger checkins_reject_stale_edit
  before update or delete on public.checkins
  for each row execute function private.reject_stale_checkin_edit();
