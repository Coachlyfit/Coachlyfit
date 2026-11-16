-- Connect / disconnect Google Calendar through the caller's own session.
--
-- google_connections and google_sync_jobs have no user write policies (the
-- refresh token must never be written or read by a user session directly), but
-- the OAuth callback and the Disconnect button run in a normal request path,
-- where the service-role client is off limits (eslint no-restricted-imports).
-- These two security-definer functions are the narrow door: they act on the
-- *caller's own* row only (auth.uid() is the tenant owner), never on an id the
-- caller passes in.

-- Store a fresh grant. The refresh token arrives already encrypted (AES-256-GCM,
-- done server-side before this call). Returns the previous calendar id, if any,
-- so the caller can delete the old "Coachly Fit" calendar at Google.
-- Queues one sync job per upcoming live appointment, so a new calendar isn't
-- empty until something changes. Existing events ids on appointments are left
-- alone: the sync patches, gets 404 on the new calendar, and creates.
create function public.google_connect(
  p_encrypted_refresh_token text,
  p_calendar_id text,
  p_email text,
  p_scopes text[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_previous text;
begin
  -- coaches.id is the tenant owner's profile id: a member or client has no row.
  if v_uid is null or not exists (select 1 from public.coaches where id = v_uid) then
    raise exception 'Only the account owner can connect Google Calendar.' using errcode = '42501';
  end if;
  if not private.coach_has_feature(v_uid, 'appointments') then
    raise exception 'Your plan does not include scheduling.' using errcode = 'P0001', hint = 'upgrade_required';
  end if;

  select g.calendar_id into v_previous from public.google_connections g where g.coach_id = v_uid;

  insert into public.google_connections
    (coach_id, encrypted_refresh_token, calendar_id, google_email, status, scopes, connected_at, last_sync_at)
  values
    (v_uid, p_encrypted_refresh_token, p_calendar_id, nullif(p_email, ''), 'active', coalesce(p_scopes, '{}'), now(), null)
  on conflict (coach_id) do update set
    encrypted_refresh_token = excluded.encrypted_refresh_token,
    calendar_id = excluded.calendar_id,
    google_email = excluded.google_email,
    status = 'active',
    scopes = excluded.scopes,
    connected_at = excluded.connected_at,
    last_sync_at = null;

  insert into public.google_sync_jobs (coach_id, appointment_id)
  select a.coach_id, a.id
  from public.appointments a
  where a.coach_id = v_uid and a.status in ('requested', 'confirmed') and a.ends_at > now()
  on conflict (appointment_id) where status = 'pending' do nothing;

  return v_previous;
end;
$$;

revoke execute on function public.google_connect(text, text, text, text[]) from public, anon;
grant execute on function public.google_connect(text, text, text, text[]) to authenticated;

-- Remove the caller's connection and queued jobs, and hand back what the server
-- needs to revoke the grant and (optionally) delete the calendar at Google. The
-- row is already gone by then: a failed revoke must not leave the coach stuck
-- "connected". The encrypted token goes to server code only, never the browser.
-- Not plan-gated: a coach who downgraded can still disconnect.
create function public.google_disconnect()
returns table (token text, calendar text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not exists (select 1 from public.coaches where id = v_uid) then
    raise exception 'Only the account owner can disconnect Google Calendar.' using errcode = '42501';
  end if;

  delete from public.google_sync_jobs where coach_id = v_uid;

  return query
    delete from public.google_connections g
    where g.coach_id = v_uid
    returning g.encrypted_refresh_token, g.calendar_id;
end;
$$;

revoke execute on function public.google_disconnect() from public, anon;
grant execute on function public.google_disconnect() to authenticated;
