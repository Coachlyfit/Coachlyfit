-- Supabase's default privileges grant EXECUTE on new public functions to
-- anon directly, so 20260930000004's `revoke ... from public` left both
-- RPCs callable anonymously. They already raise without a coach/client
-- session; this just closes the endpoint.
revoke execute on function public.link_existing_client(text) from anon;
revoke execute on function public.respond_to_coach_invite(uuid, boolean, boolean) from anon;
