create type public.client_status as enum ('invited', 'active', 'archived');

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  display_name text not null,
  email text,
  phone text,
  status public.client_status not null default 'invited',
  created_at timestamptz not null default now()
);

create index clients_coach_id_idx on public.clients (coach_id);
-- One profile links to at most one coach's client roster. A person training
-- with two coaches on two accounts is out of scope for now; lifting this
-- means private.coach_id()'s `limit 1` also needs to become tenant-aware.
create unique index clients_profile_id_idx on public.clients (profile_id) where profile_id is not null;

alter table public.clients enable row level security;

create policy coach_rw on public.clients
  for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

-- A client may read (never write) their own row, e.g. to show "your coach"
-- on their profile page.
create policy client_read_own on public.clients
  for select to authenticated
  using (profile_id = (select auth.uid()));

grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.clients to service_role;

-- Invite tokens are hashed at rest; the plaintext token only ever exists in
-- the URL. Coaches manage their own invites; nothing here is readable by an
-- anonymous visitor — the /join/[token] page goes through accept_invite()
-- instead, which is the one place an anonymous caller can touch this data.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index invites_coach_id_idx on public.invites (coach_id);

alter table public.invites enable row level security;

create policy coach_rw on public.invites
  for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

grant select, insert, update, delete on public.invites to authenticated;
grant select, insert, update, delete on public.invites to service_role;

-- Per-IP attempt counter for accept_invite(), so a guessable-looking token
-- can't be brute-forced. No client-facing policies at all: only
-- accept_invite() (security definer) ever touches this table.
create table public.invite_attempts (
  ip inet primary key,
  attempts int not null default 0,
  window_started_at timestamptz not null default now()
);

alter table public.invite_attempts enable row level security;

-- Validates a plaintext invite token, links the calling (already
-- authenticated) client account to the inviting coach, and marks the
-- invite used. Runs as a definer because the caller is a just-signed-up
-- client whose profile/coach link doesn't exist yet — there is no RLS
-- policy that could authorize this any other way.
create function public.accept_invite(p_token text, p_ip inet default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites%rowtype;
  v_attempts int;
begin
  if p_ip is not null then
    insert into public.invite_attempts (ip, attempts, window_started_at)
    values (p_ip, 1, now())
    on conflict (ip) do update set
      attempts = case
        when public.invite_attempts.window_started_at < now() - interval '1 hour'
          then 1
        else public.invite_attempts.attempts + 1
      end,
      window_started_at = case
        when public.invite_attempts.window_started_at < now() - interval '1 hour'
          then now()
        else public.invite_attempts.window_started_at
      end
    returning attempts into v_attempts;

    if v_attempts > 20 then
      raise exception 'Too many attempts. Try again later.' using errcode = '42901';
    end if;
  end if;

  select * into v_invite
  from public.invites
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if v_invite.id is null then
    raise exception 'Invalid or expired invite.' using errcode = 'P0002';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'This invite has already been used.' using errcode = 'P0002';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'This invite has expired.' using errcode = 'P0002';
  end if;

  update public.clients
  set profile_id = (select auth.uid()), status = 'active'
  where id = v_invite.client_id;

  update public.profiles set role = 'client' where id = (select auth.uid());

  update public.invites set accepted_at = now() where id = v_invite.id;

  return json_build_object('coach_id', v_invite.coach_id, 'client_id', v_invite.client_id);
end;
$$;

revoke execute on function public.accept_invite(text, inet) from public;
grant execute on function public.accept_invite(text, inet) to authenticated;
