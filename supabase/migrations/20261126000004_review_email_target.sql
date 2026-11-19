-- After a client submits a review with "share my photos" on, we email them a
-- link to withdraw that consent. The email address lives on clients, which an
-- anonymous caller can't read, so give the holder of the just-used review
-- token exactly the three values the email needs: their own address and name,
-- and the coach's name. Only for a token used in the last hour, and rate
-- limited, so it can't be used to browse addresses later.
create function public.review_email_target(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_req public.review_requests%rowtype;
  v_email text;
  v_name text;
  v_coach text;
begin
  if not private.review_rate_limit('mail:' || v_hash, 5) then
    return null;
  end if;

  select * into v_req from public.review_requests
  where token_hash = v_hash
    and used_at is not null
    and used_at > now() - interval '1 hour';
  if v_req.id is null then
    return null;
  end if;

  select email, display_name into v_email, v_name from public.clients where id = v_req.client_id;
  select business_name into v_coach from public.coaches where id = v_req.coach_id;
  if v_email is null or v_email = '' then
    return null;
  end if;

  return json_build_object('email', v_email, 'client_name', v_name, 'coach_name', v_coach);
end;
$$;

revoke execute on function public.review_email_target(text) from public;
grant execute on function public.review_email_target(text) to anon, authenticated;
