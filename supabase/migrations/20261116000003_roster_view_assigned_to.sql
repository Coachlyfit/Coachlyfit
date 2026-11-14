-- coach_client_roster lost assigned_to on the hosted project: 20261112000004
-- adds it in the middle of the column list, which `create or replace view`
-- cannot do to a view that already exists. Here the column is appended last,
-- which it can, so no drop and no grant loss. The guard makes this a no-op on
-- any database where the earlier migration did take effect.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'coach_client_roster' and column_name = 'assigned_to'
  ) then
    create or replace view public.coach_client_roster
      with (security_invoker = true)
    as
    select
      c.id              as client_id,
      c.coach_id,
      c.display_name,
      c.email,
      c.status,
      c.created_at,
      k.last_checkin_date,
      k.adherence,
      p.id              as program_id,
      p.name_ar         as program_name_ar,
      p.name_en         as program_name_en,
      s.status          as subscription_status,
      s.end_date        as subscription_end_date,
      prof.avatar_url,
      c.assigned_to
    from public.clients c
    left join public.profiles prof on prof.id = c.profile_id
    left join lateral (
      select
        max(ch.checkin_date) as last_checkin_date,
        (round(avg(ch.adherence) filter (where ch.checkin_date >= current_date - 90)))::integer as adherence
      from public.checkins ch
      where ch.client_id = c.id
    ) k on true
    left join lateral (
      select pr.id, pr.name_ar, pr.name_en
      from public.programs pr
      where pr.client_id = c.id and pr.archived_at is null
      order by pr.created_at desc
      limit 1
    ) p on true
    left join lateral (
      select cs.status, cs.end_date
      from public.client_subscriptions cs
      where cs.client_id = c.id
      order by cs.created_at desc
      limit 1
    ) s on true;
  end if;
end
$$;
