-- The public /join/[token] page is anonymous and RLS locks out `invites`
-- entirely for that role (see 20260731000005_clients_invites.sql) — this
-- is the one narrow read it's allowed: enough to show "Ahmed Fitness
-- invited you" and prefill the signup form, nothing about the token hash
-- or any other tenant data.
create function public.get_invite_info(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites%rowtype;
  v_business_name text;
  v_display_name text;
  v_email text;
begin
  select * into v_invite
  from public.invites
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if v_invite.id is null or v_invite.accepted_at is not null or v_invite.expires_at < now() then
    return json_build_object('valid', false);
  end if;

  select business_name into v_business_name from public.coaches where id = v_invite.coach_id;
  select display_name, email into v_display_name, v_email
    from public.clients where id = v_invite.client_id;

  return json_build_object(
    'valid', true,
    'business_name', v_business_name,
    'display_name', v_display_name,
    'email', v_email
  );
end;
$$;

revoke execute on function public.get_invite_info(text) from public;
grant execute on function public.get_invite_info(text) to anon, authenticated;
