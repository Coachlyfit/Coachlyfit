-- Coach portfolio website: per-coach one-page site on a custom domain, result
-- cards (before/after) gated by client consent, and client-written reviews.
--
-- Trust model
--   * The site's published JSON, approved reviews and consented+published
--     results are the ONLY things an anonymous visitor can read, and only
--     through get_public_site() (security definer, no client ids returned).
--   * Review tokens are hashed at rest (sha256, same as invites). The review
--     page talks to the DB only through get_review_request / submit_review /
--     withdraw_consent, which rate-limit and return generic errors.
--   * Consent is enforced in SQL: a result can only be published while its
--     card consent is 'agreed', and withdrawing consent unpublishes it.

-- ---------------------------------------------------------------- coach_sites
create table public.coach_sites (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null unique references public.coaches (id) on delete cascade,
  domain text unique
    check (domain is null or (domain = lower(domain) and domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$')),
  domain_status text not null default 'none'
    check (domain_status in ('none', 'pending', 'connected', 'error')),
  is_published boolean not null default false,
  draft jsonb not null default '{}'::jsonb,
  published_content jsonb,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.coach_sites enable row level security;

create policy coach_rw on public.coach_sites
  for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

grant select, insert, update, delete on public.coach_sites to authenticated;
grant select, insert, update, delete on public.coach_sites to service_role;

create function private.touch_coach_site()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger coach_sites_touch
  before update on public.coach_sites
  for each row execute function private.touch_coach_site();

-- -------------------------------------------------------------- progress_cards
-- A publishable before/after pair for one client. The photos stay in the
-- private progress-media bucket; a public copy only exists while the card is
-- published (site_results).
create table public.progress_cards (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  before_media_id uuid not null references public.media (id) on delete cascade,
  after_media_id uuid not null references public.media (id) on delete cascade,
  duration_days int not null check (duration_days > 0 and duration_days <= 3650),
  weight_delta numeric(5, 1),
  created_at timestamptz not null default now(),
  check (before_media_id <> after_media_id)
);

create index progress_cards_coach_id_idx on public.progress_cards (coach_id);
create index progress_cards_client_id_idx on public.progress_cards (client_id);

alter table public.progress_cards enable row level security;

create policy coach_rw on public.progress_cards
  for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

grant select, insert, update, delete on public.progress_cards to authenticated;
grant select, insert, update, delete on public.progress_cards to service_role;

-- Both photos must be this client's photos under this coach: RLS only checks
-- coach_id on the card itself.
create function private.progress_cards_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*) from public.media m
    where m.id in (new.before_media_id, new.after_media_id)
      and m.coach_id = new.coach_id
      and m.client_id = new.client_id
      and m.kind = 'photo'
  ) <> 2 then
    raise exception 'Invalid card photos.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger progress_cards_validate
  before insert or update on public.progress_cards
  for each row execute function private.progress_cards_validate();

-- -------------------------------------------------------------- card_consents
create table public.card_consents (
  card_id uuid primary key references public.progress_cards (id) on delete cascade,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'agreed', 'withdrawn')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  withdrawn_at timestamptz
);

create index card_consents_coach_id_idx on public.card_consents (coach_id);
create index card_consents_client_id_idx on public.card_consents (client_id);

alter table public.card_consents enable row level security;

create policy coach_read on public.card_consents
  for select to authenticated
  using (coach_id = (select private.coach_id()));

create policy client_read_own on public.card_consents
  for select to authenticated
  using (client_id = (select private.client_id()));

-- Writes happen only through the functions below (and service_role).
grant select on public.card_consents to authenticated;
grant select, insert, update, delete on public.card_consents to service_role;

-- ---------------------------------------------------------------- site_results
create table public.site_results (
  site_id uuid not null references public.coach_sites (id) on delete cascade,
  card_id uuid not null references public.progress_cards (id) on delete cascade,
  is_published boolean not null default false,
  -- Paths inside the public site-results bucket. Only set while published.
  before_path text,
  after_path text,
  -- Public copies that must be deleted from storage (consent withdrawn by the
  -- client, who can't delete storage objects). Drained by a cron route.
  purge_paths text[] not null default '{}',
  primary key (site_id, card_id)
);

create index site_results_card_id_idx on public.site_results (card_id);

alter table public.site_results enable row level security;

create policy coach_rw on public.site_results
  for all to authenticated
  using (
    exists (select 1 from public.coach_sites s
            where s.id = site_results.site_id and s.coach_id = (select private.coach_id()))
  )
  with check (
    exists (select 1 from public.coach_sites s
            where s.id = site_results.site_id and s.coach_id = (select private.coach_id()))
    and exists (select 1 from public.progress_cards c
                where c.id = site_results.card_id and c.coach_id = (select private.coach_id()))
  );

grant select, insert, update, delete on public.site_results to authenticated;
grant select, insert, update, delete on public.site_results to service_role;

-- Publishing requires an agreed consent. This is the SQL guarantee behind the
-- UI checkbox.
create function private.site_results_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_published then
    if not exists (
      select 1 from public.card_consents cc
      where cc.card_id = new.card_id and cc.status = 'agreed'
    ) then
      raise exception 'Client has not agreed to share this card.' using errcode = '42501';
    end if;
    if new.before_path is null or new.after_path is null then
      raise exception 'Published results need photos.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger site_results_guard
  before insert or update on public.site_results
  for each row execute function private.site_results_guard();

-- Withdrawing (or declining) consent unpublishes the card immediately and
-- queues its public photo copies for deletion.
create function private.card_consent_withdrawn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'withdrawn' and old.status is distinct from 'withdrawn' then
    update public.site_results
    set is_published = false,
        purge_paths = purge_paths || array_remove(array[before_path, after_path], null),
        before_path = null,
        after_path = null
    where card_id = new.card_id;
  end if;
  return new;
end;
$$;

create trigger card_consents_withdrawn
  after update on public.card_consents
  for each row execute function private.card_consent_withdrawn();

-- ----------------------------------------------------------- review_requests
create table public.review_requests (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- Card whose photos the review's consent switch would share (optional).
  card_id uuid references public.progress_cards (id) on delete set null,
  -- Signed URLs for the before/after thumbnails, valid as long as the link.
  -- Written by the coach, shown on the review page.
  preview jsonb,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '14 days'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index review_requests_coach_id_idx on public.review_requests (coach_id);
create index review_requests_client_id_idx on public.review_requests (client_id);

alter table public.review_requests enable row level security;

create policy coach_read on public.review_requests
  for select to authenticated
  using (coach_id = (select private.coach_id()));

create policy coach_insert on public.review_requests
  for insert to authenticated
  with check (
    coach_id = (select private.coach_id())
    and used_at is null
    and exists (select 1 from public.clients c
                where c.id = review_requests.client_id and c.coach_id = review_requests.coach_id)
    and (card_id is null or exists (
      select 1 from public.progress_cards pc
      where pc.id = review_requests.card_id
        and pc.coach_id = review_requests.coach_id
        and pc.client_id = review_requests.client_id))
  );

create policy coach_delete on public.review_requests
  for delete to authenticated
  using (coach_id = (select private.coach_id()) and used_at is null);

grant select, insert, delete on public.review_requests to authenticated;
grant select, insert, update, delete on public.review_requests to service_role;

-- --------------------------------------------------------------------- reviews
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  request_id uuid not null unique references public.review_requests (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 20 and 500),
  display_name text not null check (char_length(display_name) between 1 and 60),
  share_photos boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now()
);

create index reviews_coach_status_idx on public.reviews (coach_id, status, created_at desc);

alter table public.reviews enable row level security;

create policy coach_read on public.reviews
  for select to authenticated
  using (coach_id = (select private.coach_id()));

create policy coach_moderate on public.reviews
  for update to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

grant select on public.reviews to authenticated;
-- Column-level grant: the coach can change status and nothing else...
grant update (status) on public.reviews to authenticated;
grant select, insert, update, delete on public.reviews to service_role;

-- ...and a trigger makes that hold for every role that isn't the owner
-- (belt and braces; also catches a future broader grant).
create function private.reviews_lock_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rating is distinct from old.rating
     or new.body is distinct from old.body
     or new.display_name is distinct from old.display_name
     or new.share_photos is distinct from old.share_photos
     or new.client_id is distinct from old.client_id
     or new.coach_id is distinct from old.coach_id
     or new.request_id is distinct from old.request_id then
    raise exception 'Reviews cannot be edited.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger reviews_lock_content
  before update on public.reviews
  for each row execute function private.reviews_lock_content();

-- ----------------------------------------------------------- rate limiting
-- key = 'ip:<addr>' or 'tok:<token hash>'. Only the review RPCs touch it.
create table public.review_rate_limits (
  key text primary key,
  attempts int not null default 0,
  window_started_at timestamptz not null default now()
);

alter table public.review_rate_limits enable row level security;

-- Returns false once the key is over its hourly budget. Callers RETURN an
-- error value instead of raising: an exception would roll the counter back
-- and make the limit useless.
create function private.review_rate_limit(p_key text, p_max int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts int;
begin
  insert into public.review_rate_limits as r (key, attempts, window_started_at)
  values (p_key, 1, now())
  on conflict (key) do update set
    attempts = case when r.window_started_at < now() - interval '1 hour'
                    then 1 else r.attempts + 1 end,
    window_started_at = case when r.window_started_at < now() - interval '1 hour'
                             then now() else r.window_started_at end
  returning attempts into v_attempts;

  return v_attempts <= p_max;
end;
$$;

revoke execute on function private.review_rate_limit(text, int) from public;

-- ------------------------------------------------------- consent: coach/client
-- Coach asks the client for consent on a card (creates or re-sends a pending
-- request). A withdrawn card stays withdrawn; make a new card to ask again.
create function public.request_card_consent(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.progress_cards%rowtype;
begin
  select * into v_card from public.progress_cards
  where id = p_card_id and coach_id = (select private.coach_id());
  if v_card.id is null then
    raise exception 'Card not found.' using errcode = 'P0002';
  end if;

  insert into public.card_consents as cc (card_id, coach_id, client_id, status, requested_at)
  values (v_card.id, v_card.coach_id, v_card.client_id, 'pending', now())
  on conflict (card_id) do update
    set requested_at = now()
    where cc.status = 'pending';
end;
$$;

revoke execute on function public.request_card_consent(uuid) from public, anon;
grant execute on function public.request_card_consent(uuid) to authenticated;

-- Client answers a pending request from the app.
create function public.respond_card_consent(p_card_id uuid, p_agree boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.card_consents
  set status = case when p_agree then 'agreed' else 'withdrawn' end,
      decided_at = now(),
      withdrawn_at = case when p_agree then null else now() end
  where card_id = p_card_id
    and client_id = (select private.client_id())
    and status = 'pending';
end;
$$;

revoke execute on function public.respond_card_consent(uuid, boolean) from public, anon;
grant execute on function public.respond_card_consent(uuid, boolean) to authenticated;

-- Client withdraws consent from the app, any time.
create function public.withdraw_consent_client(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.card_consents
  set status = 'withdrawn', withdrawn_at = now()
  where card_id = p_card_id
    and client_id = (select private.client_id())
    and status <> 'withdrawn';
end;
$$;

revoke execute on function public.withdraw_consent_client(uuid) from public, anon;
grant execute on function public.withdraw_consent_client(uuid) to authenticated;

-- ------------------------------------------------------------- public site
-- Branding is gated like get_portal_branding: without the custom_branding
-- feature the site falls back to Coachly defaults.
create function public.get_public_site(p_key text)
returns json
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_key text := lower(trim(p_key));
  v_site public.coach_sites%rowtype;
  v_coach public.coaches%rowtype;
  v_branded boolean;
  v_coach_json json;
begin
  select s.* into v_site
  from public.coach_sites s
  join public.coaches c on c.id = s.coach_id
  where (s.domain = v_key or c.slug = v_key) and c.archived_at is null
  limit 1;

  if v_site.id is null then
    return null;
  end if;

  select * into v_coach from public.coaches where id = v_site.coach_id;
  v_branded := private.coach_has_feature(v_coach.id, 'custom_branding');

  v_coach_json := json_build_object(
    'business_name', v_coach.business_name,
    'slug', v_coach.slug,
    'logo_path', case when v_branded then v_coach.logo_path end,
    'brand_primary', case when v_branded then v_coach.brand_primary end,
    'brand_accent', case when v_branded then v_coach.brand_accent end
  );

  if not v_site.is_published or v_site.published_content is null then
    return json_build_object(
      'is_published', false,
      'domain', v_site.domain,
      'coach', v_coach_json
    );
  end if;

  return json_build_object(
    'is_published', true,
    'domain', v_site.domain,
    'published_at', v_site.published_at,
    'content', v_site.published_content,
    'coach', v_coach_json,
    'results', coalesce((
      select json_agg(json_build_object(
        'id', sr.card_id,
        'before_path', sr.before_path,
        'after_path', sr.after_path,
        'duration_days', pc.duration_days,
        'weight_delta', pc.weight_delta
      ) order by pc.created_at desc)
      from public.site_results sr
      join public.progress_cards pc on pc.id = sr.card_id
      join public.card_consents cc on cc.card_id = sr.card_id
      where sr.site_id = v_site.id
        and sr.is_published
        and cc.status = 'agreed'
        and sr.before_path is not null
        and sr.after_path is not null
    ), '[]'::json),
    'reviews', coalesce((
      select json_agg(x) from (
        select json_build_object(
          'id', r.id,
          'rating', r.rating,
          'body', r.body,
          'display_name', r.display_name,
          'created_at', r.created_at
        ) as x
        from public.reviews r
        where r.coach_id = v_site.coach_id and r.status = 'approved'
        order by r.created_at desc
        limit 12
      ) q
    ), '[]'::json)
  );
end;
$$;

revoke execute on function public.get_public_site(text) from public;
grant execute on function public.get_public_site(text) to anon, authenticated;

-- Proxy lookup: does a site exist for this custom domain / coach slug?
create function public.site_exists(p_key text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_sites s
    join public.coaches c on c.id = s.coach_id
    where (s.domain = lower(trim(p_key)) or c.slug = lower(trim(p_key)))
      and c.archived_at is null
  );
$$;

revoke execute on function public.site_exists(text) from public;
grant execute on function public.site_exists(text) to anon, authenticated;

-- ------------------------------------------------------------ review page
create function public.get_review_request(p_token text, p_ip inet default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_req public.review_requests%rowtype;
  v_coach public.coaches%rowtype;
  v_client_name text;
  v_branded boolean;
  v_state text;
begin
  if p_ip is not null and not private.review_rate_limit('ip:' || p_ip::text, 120) then
    return json_build_object('state', 'invalid');
  end if;

  select * into v_req from public.review_requests where token_hash = v_hash;
  if v_req.id is null then
    return json_build_object('state', 'invalid');
  end if;

  select * into v_coach from public.coaches where id = v_req.coach_id;
  select display_name into v_client_name from public.clients where id = v_req.client_id;
  v_branded := private.coach_has_feature(v_coach.id, 'custom_branding');

  v_state := case
    when v_req.used_at is not null then 'used'
    when v_req.expires_at < now() then 'expired'
    else 'open'
  end;

  return json_build_object(
    'state', v_state,
    'expires_at', v_req.expires_at,
    'first_name', split_part(trim(coalesce(v_client_name, '')), ' ', 1),
    'preview', case when v_state = 'open' then v_req.preview end,
    'coach', json_build_object(
      'business_name', v_coach.business_name,
      'slug', v_coach.slug,
      'logo_path', case when v_branded then v_coach.logo_path end,
      'brand_primary', case when v_branded then v_coach.brand_primary end,
      'brand_accent', case when v_branded then v_coach.brand_accent end
    )
  );
end;
$$;

revoke execute on function public.get_review_request(text, inet) from public;
grant execute on function public.get_review_request(text, inet) to anon, authenticated;

create function public.submit_review(
  p_token text,
  p_rating int,
  p_body text,
  p_first_name text,
  p_share_photos boolean,
  p_ip inet default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_req public.review_requests%rowtype;
  v_client_name text;
  v_first text := split_part(trim(coalesce(p_first_name, '')), ' ', 1);
  v_last text;
  v_display text;
  v_body text := trim(coalesce(p_body, ''));
begin
  -- Errors are returned, never raised: see review_rate_limit().
  if (p_ip is not null and not private.review_rate_limit('ip:' || p_ip::text, 20))
     or not private.review_rate_limit('tok:' || v_hash, 10) then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if p_rating is null or p_rating not between 1 and 5
     or char_length(v_body) not between 20 and 500
     or char_length(v_first) not between 1 and 40 then
    return json_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Lock the request row so a double submit can't create two reviews.
  select * into v_req from public.review_requests
  where token_hash = v_hash
  for update;

  if v_req.id is null or v_req.used_at is not null or v_req.expires_at < now() then
    return json_build_object('ok', false, 'error', 'invalid_link');
  end if;

  select display_name into v_client_name from public.clients where id = v_req.client_id;
  -- "First name + last initial": first name as typed, initial from the
  -- client's own record (last word of their name, if they have more than one).
  if array_length(regexp_split_to_array(trim(coalesce(v_client_name, '')), '\s+'), 1) > 1 then
    v_last := (regexp_split_to_array(trim(v_client_name), '\s+'))[
      array_length(regexp_split_to_array(trim(v_client_name), '\s+'), 1)];
  end if;
  v_display := case
    when v_last is not null and v_last <> '' then v_first || ' ' || upper(left(v_last, 1)) || '.'
    else v_first
  end;

  insert into public.reviews (coach_id, client_id, request_id, rating, body, display_name, share_photos)
  values (v_req.coach_id, v_req.client_id, v_req.id, p_rating, v_body, v_display, coalesce(p_share_photos, false));

  update public.review_requests set used_at = now() where id = v_req.id;

  if coalesce(p_share_photos, false) then
    if v_req.card_id is not null then
      update public.card_consents
      set status = 'agreed', decided_at = now(), withdrawn_at = null
      where card_id = v_req.card_id and client_id = v_req.client_id;
    else
      update public.card_consents
      set status = 'agreed', decided_at = now()
      where client_id = v_req.client_id and status = 'pending';
    end if;
  end if;

  return json_build_object(
    'ok', true,
    'display_name', v_display,
    'share_photos', coalesce(p_share_photos, false)
  );
end;
$$;

revoke execute on function public.submit_review(text, int, text, text, boolean, inet) from public;
grant execute on function public.submit_review(text, int, text, text, boolean, inet) to anon, authenticated;

-- Withdraw from the thank-you page or the email link. Works on used and
-- expired tokens (withdrawal never expires).
create function public.withdraw_consent(p_token text, p_ip inet default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_req public.review_requests%rowtype;
  v_count int;
begin
  -- Returns -1 for an unknown token or a rate-limited caller (generic on
  -- purpose), otherwise the number of cards unpublished.
  if (p_ip is not null and not private.review_rate_limit('ip:' || p_ip::text, 30))
     or not private.review_rate_limit('tok:' || v_hash, 20) then
    return -1;
  end if;

  select * into v_req from public.review_requests where token_hash = v_hash;
  if v_req.id is null then
    return -1;
  end if;

  update public.card_consents
  set status = 'withdrawn', withdrawn_at = now()
  where client_id = v_req.client_id
    and status <> 'withdrawn'
    and (v_req.card_id is null or card_id = v_req.card_id);
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

revoke execute on function public.withdraw_consent(text, inet) from public;
grant execute on function public.withdraw_consent(text, inet) to anon, authenticated;

-- ----------------------------------------------------------------- storage
-- Coach photo. Public read (object URLs are unguessable uuids); a coach can
-- only write inside their own folder.
insert into storage.buckets (id, name, public)
values ('coach-site', 'coach-site', true);

create policy coach_site_coach_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'coach-site'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy coach_site_coach_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'coach-site'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy coach_site_coach_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'coach-site'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy coach_site_coach_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'coach-site'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

-- Public copies of consented before/after photos: {coach_id}/{card_id}/...
insert into storage.buckets (id, name, public)
values ('site-results', 'site-results', true);

create policy site_results_coach_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'site-results'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy site_results_coach_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'site-results'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );

create policy site_results_coach_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'site-results'
    and (storage.foldername(name))[1] = (select private.coach_id())::text
  );
