-- "Apply for coaching": visitors of a coach's public site submit an
-- application; the coach reviews it from the dashboard.
--
-- Public writes follow the site's convention: no anon table policy, only a
-- security-definer RPC that validates, rate limits and inserts. Coaches read
-- and update (status / notes only) their own rows through RLS.

create table public.coaching_applications (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 200),
  phone text not null check (char_length(phone) between 5 and 30),
  goal text not null check (goal in ('lose_fat', 'build_muscle', 'general_fitness', 'other')),
  activity_level text not null
    check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  source text check (source is null or char_length(source) <= 200),
  message text check (message is null or char_length(message) <= 2000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'accepted', 'rejected')),
  coach_notes text check (coach_notes is null or char_length(coach_notes) <= 2000),
  created_at timestamptz not null default now()
);

create index coaching_applications_coach_created_idx
  on public.coaching_applications (coach_id, created_at desc);

alter table public.coaching_applications enable row level security;

create policy coach_read on public.coaching_applications for select to authenticated
  using (coach_id = (select private.coach_id()));

create policy coach_update on public.coaching_applications for update to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

revoke all on public.coaching_applications from anon, authenticated;
grant select, update on public.coaching_applications to authenticated;
grant select, insert, update, delete on public.coaching_applications to service_role;

-- Coaches can only triage: everything the applicant typed is frozen.
create function private.coaching_applications_lock_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.coach_id is distinct from old.coach_id
     or new.name is distinct from old.name
     or new.email is distinct from old.email
     or new.phone is distinct from old.phone
     or new.goal is distinct from old.goal
     or new.activity_level is distinct from old.activity_level
     or new.source is distinct from old.source
     or new.message is distinct from old.message
     or new.created_at is distinct from old.created_at then
    raise exception 'coaching application content is read-only';
  end if;
  return new;
end;
$$;

create trigger coaching_applications_lock_content
  before update on public.coaching_applications
  for each row execute function private.coaching_applications_lock_content();

-- Public submit. p_key = the site's key (custom domain or coach slug), same as
-- get_public_site. Errors are returned, never raised: see review_rate_limit().
create function public.submit_coaching_application(
  p_key text,
  p_name text,
  p_email text,
  p_phone text,
  p_goal text,
  p_activity_level text,
  p_source text default null,
  p_message text default null,
  p_ip inet default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := lower(trim(coalesce(p_key, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(coalesce(p_phone, ''));
  v_source text := nullif(trim(coalesce(p_source, '')), '');
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_coach_id uuid;
  v_id uuid;
begin
  if (p_ip is not null and not private.review_rate_limit('apply-ip:' || p_ip::text, 10))
     or not private.review_rate_limit('apply-mail:' || encode(extensions.digest(v_email, 'sha256'), 'hex'), 3) then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if char_length(v_name) not between 1 and 100
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200
     or char_length(v_phone) not between 5 and 30
     or p_goal not in ('lose_fat', 'build_muscle', 'general_fitness', 'other')
     or p_activity_level not in ('sedentary', 'light', 'moderate', 'active', 'very_active')
     or char_length(coalesce(v_source, '')) > 200
     or char_length(coalesce(v_message, '')) > 2000 then
    return json_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Only a published site accepts applications.
  select s.coach_id into v_coach_id
  from public.coach_sites s
  join public.coaches c on c.id = s.coach_id
  where (s.domain = v_key or c.slug = v_key)
    and c.archived_at is null
    and s.is_published
  limit 1;

  if v_coach_id is null then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into public.coaching_applications
    (coach_id, name, email, phone, goal, activity_level, source, message)
  values
    (v_coach_id, v_name, v_email, v_phone, p_goal, p_activity_level, v_source, v_message)
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id, 'coach_id', v_coach_id);
end;
$$;

revoke execute on function public.submit_coaching_application(text, text, text, text, text, text, text, text, inet) from public;
grant execute on function public.submit_coaching_application(text, text, text, text, text, text, text, text, inet) to anon, authenticated;

-- The notification email needs the coach's address and language, which an
-- anonymous caller can't read. Like review_email_target: only for an
-- application created in the last 10 minutes (its id is never sent to the
-- browser), rate limited, two values only: the business address, else the
-- login address, and the language.
create function public.application_notify_target(p_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid;
  v_email text;
  v_locale text;
begin
  if not private.review_rate_limit('apply-notify:' || p_id::text, 3) then
    return null;
  end if;

  select coach_id into v_coach_id from public.coaching_applications
  where id = p_id and created_at > now() - interval '10 minutes';
  if v_coach_id is null then
    return null;
  end if;

  select coalesce(nullif(trim(c.contact_email), ''), u.email) into v_email
  from public.coaches c
  join auth.users u on u.id = c.id
  where c.id = v_coach_id;
  select locale into v_locale from public.profiles where id = v_coach_id;
  return json_build_object('email', v_email, 'locale', v_locale);
end;
$$;

revoke execute on function public.application_notify_target(uuid) from public;
grant execute on function public.application_notify_target(uuid) to anon, authenticated;
