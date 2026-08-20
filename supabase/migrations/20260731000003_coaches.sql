-- A coach's tenant identity. id = profiles.id (1:1), so "coach_id" columns
-- elsewhere reference this table but are, in effect, the owning profile id.
create table public.coaches (
  id uuid primary key references public.profiles (id) on delete cascade,
  business_name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table public.coaches enable row level security;

create policy coaches_select_own on public.coaches
  for select to authenticated
  using (id = (select auth.uid()));

create policy coaches_update_own on public.coaches
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select, update on public.coaches to authenticated;
grant select, insert, update, delete on public.coaches to service_role;

-- Populates profiles (and coaches, when the signup is a coach) right after
-- Supabase Auth creates the underlying auth.users row. Role and coach
-- metadata come from the signup call's options.data, e.g.:
--   supabase.auth.signUp({ email, password, options: { data: {
--     role: 'coach', full_name, business_name, locale
--   }}})
-- A client signup (via the invite flow) passes role: 'client' and skips
-- business_name; accept_invite() links the resulting profile afterward.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  v_role := coalesce(
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    'coach'
  );

  insert into public.profiles (id, role, full_name, locale)
  values (
    new.id,
    v_role,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'locale', 'ar')
  );

  if v_role = 'coach' then
    insert into public.coaches (id, business_name, slug)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'business_name', 'My Coaching Business'),
      'coach-' || replace(new.id::text, '-', '')
    );
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
