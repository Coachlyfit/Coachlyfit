-- Coach switching. Until now clients.coach_id was the only client->coach
-- link, and every coach policy was `coach_id = private.coach_id()` on the
-- row itself -- so a client could never move coaches without the old coach
-- keeping read access to everything they had ever logged.
--
-- From here on the clients row belongs to the person (it already was one
-- row per profile, see clients_profile_id_idx), and the coach link is a
-- coaching_relationships row that can end and restart with someone else.
--
-- clients.coach_id is NOT dropped: it becomes a deprecated mirror of the
-- active relationship's coach, kept in sync by respond_to_coach_invite().
-- private.tenant_id(), the coach roster queries and the client portal all
-- still read it; drop it once they read coaching_relationships instead.

create type public.coaching_relationship_status as enum ('pending', 'active', 'ended');

create table public.coaching_relationships (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  status public.coaching_relationship_status not null default 'pending',
  started_at timestamptz,
  ended_at timestamptz,
  share_history boolean not null default false,
  created_at timestamptz not null default now()
);

-- A client has at most one active coach, and a coach at most one open
-- invite per client (re-inviting reuses it instead of stacking up rows).
create unique index coaching_relationships_one_active_idx
  on public.coaching_relationships (client_id) where status = 'active';
create unique index coaching_relationships_one_pending_idx
  on public.coaching_relationships (coach_id, client_id) where status = 'pending';
create index coaching_relationships_coach_id_idx on public.coaching_relationships (coach_id);

alter table public.coaching_relationships enable row level security;

-- Read-only for both sides. Every write goes through a security definer
-- function below (or the clients insert trigger), never direct DML.
create policy client_read_own on public.coaching_relationships
  for select to authenticated
  using (client_id = (select private.client_id()));
create policy coach_read_own on public.coaching_relationships
  for select to authenticated
  using (coach_id = (select private.coach_id()));

grant select on public.coaching_relationships to authenticated;
grant select, insert, update, delete on public.coaching_relationships to service_role;

-- Every existing link becomes an active relationship.
insert into public.coaching_relationships (coach_id, client_id, status, started_at, created_at)
select coach_id, id, 'active', created_at, created_at from public.clients;

-- A coach-created roster row (invite, onboarding import) is active right
-- away: the coach builds programs before the client ever signs up, and the
-- client claiming the row later (accept_invite / handle_new_user) doesn't
-- change who coaches them.
create function private.start_coaching_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.coaching_relationships (coach_id, client_id, status, started_at)
  values (new.coach_id, new.id, 'active', now());
  return new;
end;
$$;

create trigger clients_start_coaching_relationship
  after insert on public.clients
  for each row execute function private.start_coaching_relationship();

comment on column public.clients.coach_id is
  'DEPRECATED: mirror of the active coaching_relationships row''s coach_id, maintained by respond_to_coach_invite(). Read coaching_relationships for new code; drop once tenant_id() and existing readers are migrated.';

-- Switching coaches moves the client into the new coach's roster, so the
-- seat cap applies exactly like a new invite.
create trigger clients_enforce_cap_on_coach_change
  before update of coach_id on public.clients
  for each row
  when (old.coach_id is distinct from new.coach_id)
  execute function private.enforce_client_cap();

-- ---------------------------------------------------------------------------
-- Access helpers. Same InitPlan convention as tenant_id()/coach_id(): call
-- them as `(select private.x())` / `in (select private.x())`.

create function private.active_client_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select client_id from public.coaching_relationships
  where coach_id = (select private.coach_id()) and status = 'active'
$$;

create function private.active_relationship_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select id from public.coaching_relationships
  where coach_id = (select private.coach_id()) and status = 'active'
$$;

create function private.shared_client_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select client_id from public.coaching_relationships
  where coach_id = (select private.coach_id()) and status = 'active' and share_history
$$;

-- The caller's active relationships, plus the ended ones of the same
-- clients where the client opted to share history with the caller.
create function private.visible_relationship_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select r.id from public.coaching_relationships r
  where r.coach_id = (select private.coach_id()) and r.status = 'active'
  union
  select h.id from public.coaching_relationships r
  join public.coaching_relationships h on h.client_id = r.client_id and h.status = 'ended'
  where r.coach_id = (select private.coach_id()) and r.status = 'active' and r.share_history
$$;

revoke execute on function private.active_client_ids() from public;
revoke execute on function private.active_relationship_ids() from public;
revoke execute on function private.shared_client_ids() from public;
revoke execute on function private.visible_relationship_ids() from public;
grant execute on function private.active_client_ids() to authenticated;
grant execute on function private.active_relationship_ids() to authenticated;
grant execute on function private.shared_client_ids() to authenticated;
grant execute on function private.visible_relationship_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Client-authored data: tagged with the relationship it was logged under,
-- and the coach reads it by relationship, not by coach_id.

-- Always overwritten, never trusted from the caller: a client choosing
-- relationship_id could otherwise file a row under someone else's coach.
create function private.stamp_relationship_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.relationship_id := old.relationship_id;
  else
    new.relationship_id := (
      select id from public.coaching_relationships
      where client_id = new.client_id and status = 'active'
    );
  end if;
  return new;
end;
$$;

-- The immutability triggers fire for every role (including this migration),
-- so they'd reject the backfill of rows older than 7 days.
alter table public.checkins disable trigger checkins_reject_stale_edit;
alter table public.workout_set_logs disable trigger workout_set_logs_reject_stale_edit;
alter table public.activity_logs disable trigger activity_logs_reject_stale_edit;

do $$
declare
  t text;
begin
  foreach t in array array[
    'checkins', 'body_metrics', 'media', 'form_submissions',
    'workout_sessions', 'workout_set_logs', 'workout_exercise_results',
    'activity_logs', 'messages'
  ]
  loop
    execute format(
      'alter table public.%I add column relationship_id uuid references public.coaching_relationships (id) on delete set null', t
    );
    execute format(
      'update public.%I x set relationship_id = r.id
         from public.coaching_relationships r
         where r.client_id = x.client_id and r.status = ''active''', t
    );
    execute format('create index %I on public.%I (relationship_id)', t || '_relationship_id_idx', t);
    execute format(
      'create trigger %I before insert or update of relationship_id on public.%I
         for each row execute function private.stamp_relationship_id()', t || '_stamp_relationship', t
    );
  end loop;

  foreach t in array array[
    'checkins', 'body_metrics', 'media', 'form_submissions',
    'workout_sessions', 'workout_set_logs', 'workout_exercise_results', 'activity_logs'
  ]
  loop
    execute format('drop policy coach_read on public.%I', t);
    execute format(
      'create policy coach_read on public.%I for select to authenticated
         using (relationship_id in (select private.visible_relationship_ids()))', t
    );
  end loop;
end $$;

alter table public.checkins enable trigger checkins_reject_stale_edit;
alter table public.workout_set_logs enable trigger workout_set_logs_reject_stale_edit;
alter table public.activity_logs enable trigger activity_logs_reject_stale_edit;

-- Deleting a photo is a live-relationship moderation call, not something a
-- new coach does to history the client merely shared.
drop policy coach_delete on public.media;
create policy coach_delete on public.media for delete to authenticated
  using (relationship_id in (select private.active_relationship_ids()));

-- A conversation belongs to its relationship: never shared with a later
-- coach, and the old coach can't keep messaging someone who left.
drop policy coach_rw on public.messages;
create policy coach_rw on public.messages for all to authenticated
  using (relationship_id in (select private.active_relationship_ids()))
  with check (relationship_id in (select private.active_relationship_ids()));

-- ---------------------------------------------------------------------------
-- Coach-owned per-client data: the coach keeps reading what they own after
-- the relationship ends (their programs, notes, billing history), but can
-- only write for clients they actively coach. client_id is null for
-- templates, which stay fully editable.

do $$
declare
  t text;
begin
  foreach t in array array[
    'programs', 'program_days', 'program_items', 'program_item_sets', 'program_activities',
    'diet_plans', 'meals', 'meal_items', 'rehab_protocols', 'rehab_phases',
    'form_assignments', 'client_observations', 'coaching_decisions',
    'client_subscriptions', 'client_transactions'
  ]
  loop
    execute format('drop policy coach_rw on public.%I', t);
    execute format(
      'create policy coach_rw on public.%I for all to authenticated
         using (coach_id = (select private.coach_id())
                and (client_id is null or client_id in (select private.active_client_ids())))
         with check (coach_id = (select private.coach_id())
                and (client_id is null or client_id in (select private.active_client_ids())))', t
    );
    execute format(
      'create policy coach_read_own on public.%I for select to authenticated
         using (coach_id = (select private.coach_id()))', t
    );
  end loop;
end $$;

drop policy coach_rw on public.invoices;
create policy coach_rw on public.invoices for all to authenticated
  using (
    coach_id = (select private.coach_id())
    and client_id in (select private.active_client_ids())
  )
  with check (
    coach_id = (select private.coach_id())
    and client_id in (select private.active_client_ids())
    and (transaction_id is null or exists (select 1 from public.client_transactions t where t.id = transaction_id and t.client_id = invoices.client_id))
  );
create policy coach_read_own on public.invoices for select to authenticated
  using (coach_id = (select private.coach_id()));

-- ---------------------------------------------------------------------------
-- The client keeps read-only access to what their past coaches assigned.
-- Those rows reference the old coach's custom exercises/foods/form
-- templates, which tenant_id()-based policies no longer expose once
-- tenant_id() points at the new coach.

create index program_items_client_id_idx on public.program_items (client_id);
create index meal_items_client_id_idx on public.meal_items (client_id);

create policy client_read_assigned on public.exercises for select to authenticated
  using (id in (
    select pi.exercise_id from public.program_items pi
    where pi.client_id = (select private.client_id())
  ));

create policy client_read_assigned on public.foods for select to authenticated
  using (id in (
    select mi.food_id from public.meal_items mi
    where mi.client_id = (select private.client_id())
  ));

create policy client_read_assigned on public.form_template_versions for select to authenticated
  using (id in (
    select fa.template_version_id from public.form_assignments fa
    where fa.client_id = (select private.client_id())
  ));

create policy client_read_assigned on public.form_templates for select to authenticated
  using (id in (
    select v.template_id from public.form_template_versions v
    join public.form_assignments fa on fa.template_version_id = v.id
    where fa.client_id = (select private.client_id())
  ));

-- Pending and past coaches, so the client can see who is inviting them and
-- who assigned an old program.
create policy client_read_related_coach on public.coaches for select to authenticated
  using (id in (
    select r.coach_id from public.coaching_relationships r
    where r.client_id = (select private.client_id())
  ));

-- ---------------------------------------------------------------------------
-- progress-media storage (path: coach_id/client_id/file). The client reads
-- their own files from every coach era; a coach reads only while active, and
-- only their own folder unless the client shared history.

drop policy progress_media_coach_select on storage.objects;
drop policy progress_media_client_select on storage.objects;
drop policy progress_media_delete on storage.objects;

create policy progress_media_coach_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-media'
    and (storage.foldername(name))[2] in (select id::text from private.active_client_ids() id)
    and (
      (storage.foldername(name))[1] = (select private.coach_id())::text
      or (storage.foldername(name))[2] in (select id::text from private.shared_client_ids() id)
    )
  );

create policy progress_media_client_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-media'
    and (storage.foldername(name))[2] = (select private.client_id())::text
  );

create policy progress_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'progress-media'
    and (
      (
        (storage.foldername(name))[1] = (select private.coach_id())::text
        and (storage.foldername(name))[2] in (select id::text from private.active_client_ids() id)
      )
      or (storage.foldername(name))[2] = (select private.client_id())::text
    )
  );

-- ---------------------------------------------------------------------------
-- Coach check-in RPCs: only check-ins from the caller's live relationship.

create or replace function public.review_checkin(
  p_checkin_id uuid,
  p_decision text,
  p_adjustments jsonb default null,
  p_coach_reply text default null
)
returns public.checkins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.checkins;
begin
  if (select private.coach_id()) is null then
    raise exception 'Coach only.' using errcode = '42501';
  end if;

  if p_decision not in ('keep', 'adjust', 'call') then
    raise exception 'Invalid decision.' using errcode = '22023';
  end if;

  update public.checkins
  set reviewed_at = now(),
      reviewed_by = (select private.coach_id()),
      decision = p_decision,
      adjustments = p_adjustments,
      coach_reply = p_coach_reply
  where id = p_checkin_id
    and coach_id = (select private.coach_id())
    and relationship_id in (select private.active_relationship_ids())
  returning * into v_row;

  if not found then
    raise exception 'Check-in not found.' using errcode = '22023';
  end if;

  return v_row;
end;
$$;

create or replace function public.mark_checkin_seen(p_checkin_id uuid)
returns public.checkins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.checkins;
begin
  if (select private.coach_id()) is null then
    raise exception 'Coach only.' using errcode = '42501';
  end if;

  update public.checkins
  set coach_seen_at = coalesce(coach_seen_at, now())
  where id = p_checkin_id
    and coach_id = (select private.coach_id())
    and relationship_id in (select private.active_relationship_ids())
  returning * into v_row;

  if not found then
    raise exception 'Check-in not found.' using errcode = '22023';
  end if;

  return v_row;
end;
$$;

create or replace function public.mark_checkin_adjustment_applied(p_checkin_id uuid)
returns public.checkins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.checkins;
begin
  if (select private.coach_id()) is null then
    raise exception 'Coach only.' using errcode = '42501';
  end if;

  update public.checkins
  set adjustment_applied_at = now()
  where id = p_checkin_id
    and coach_id = (select private.coach_id())
    and relationship_id in (select private.active_relationship_ids())
  returning * into v_row;

  if not found then
    raise exception 'Check-in not found.' using errcode = '22023';
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invite flow for people who already have a client account.

-- Coach side: if the email belongs to an existing client account, open (or
-- reuse) a pending relationship and notify the client instead of creating a
-- duplicate roster row. Returns null when there is no such account, and the
-- caller falls back to the normal new-client invite.
-- ponytail: this tells a coach whether an email has a client account; the
-- invite UI has to say "sent to their app" vs "share this link" anyway.
create function public.link_existing_client(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := (select private.coach_id());
  v_client public.clients;
  v_relationship_id uuid;
begin
  if v_coach_id is null then
    raise exception 'Coach only.' using errcode = '42501';
  end if;

  select c.* into v_client
  from auth.users u
  join public.profiles p on p.id = u.id and p.role = 'client'
  join public.clients c on c.profile_id = u.id
  where lower(u.email::text) = lower(trim(p_email));

  if v_client.id is null then
    return null;
  end if;

  if exists (
    select 1 from public.coaching_relationships
    where client_id = v_client.id and coach_id = v_coach_id and status = 'active'
  ) then
    raise exception 'already_your_client' using errcode = 'P0001';
  end if;

  select id into v_relationship_id
  from public.coaching_relationships
  where client_id = v_client.id and coach_id = v_coach_id and status = 'pending';

  if v_relationship_id is null then
    insert into public.coaching_relationships (coach_id, client_id, status)
    values (v_coach_id, v_client.id, 'pending')
    returning id into v_relationship_id;

    insert into public.notifications (profile_id, kind, payload)
    select v_client.profile_id, 'coach_invite',
      jsonb_build_object('relationship_id', v_relationship_id, 'business_name', co.business_name)
    from public.coaches co where co.id = v_coach_id;
  end if;

  return v_relationship_id;
end;
$$;

-- Client side, one transaction: accept ends the current relationship,
-- activates the new one, moves the (deprecated) clients.coach_id mirror,
-- stops the old coach's billing and tells the old coach. Decline just
-- closes the invite.
create function public.respond_to_coach_invite(
  p_relationship_id uuid,
  p_accept boolean,
  p_share_history boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid := (select private.client_id());
  v_new public.coaching_relationships;
  v_old public.coaching_relationships;
  v_display_name text;
begin
  if v_client_id is null then
    raise exception 'Client only.' using errcode = '42501';
  end if;

  -- Serializes two concurrent accepts for the same client.
  perform 1 from public.coaching_relationships where client_id = v_client_id for update;

  select * into v_new
  from public.coaching_relationships
  where id = p_relationship_id and client_id = v_client_id and status = 'pending';

  if v_new.id is null then
    raise exception 'Invite not found.' using errcode = 'P0002';
  end if;

  if not p_accept then
    update public.coaching_relationships
    set status = 'ended', ended_at = now()
    where id = v_new.id;
    return;
  end if;

  update public.coaching_relationships
  set status = 'ended', ended_at = now()
  where client_id = v_client_id and status = 'active'
  returning * into v_old;

  update public.coaching_relationships
  set status = 'active', started_at = now(), share_history = coalesce(p_share_history, false)
  where id = v_new.id;

  update public.clients
  set coach_id = v_new.coach_id, status = 'active'
  where id = v_client_id
  returning display_name into v_display_name;

  if v_old.id is not null then
    -- Same status change as ClientBillingService.cancelSubscription.
    update public.client_subscriptions
    set status = 'canceled'
    where client_id = v_client_id
      and coach_id = v_old.coach_id
      and status in ('active', 'frozen');

    insert into public.notifications (profile_id, kind, payload)
    values (
      v_old.coach_id,
      'client_left',
      jsonb_build_object('client_id', v_client_id, 'display_name', v_display_name)
    );
  end if;
end;
$$;

revoke execute on function public.link_existing_client(text) from public;
revoke execute on function public.respond_to_coach_invite(uuid, boolean, boolean) from public;
grant execute on function public.link_existing_client(text) to authenticated;
grant execute on function public.respond_to_coach_invite(uuid, boolean, boolean) to authenticated;
