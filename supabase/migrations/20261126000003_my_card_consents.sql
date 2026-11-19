-- A client can read their own card_consents rows but not the progress card
-- behind them (progress_cards is coach-only). The app needs the card's photos
-- and duration to show the client WHAT they are agreeing to share, so expose
-- exactly that, for the caller's own consents, through a definer function.
create function public.my_card_consents()
returns table (
  card_id uuid,
  status text,
  requested_at timestamptz,
  decided_at timestamptz,
  duration_days int,
  weight_delta numeric,
  before_path text,
  after_path text,
  business_name text
)
language sql
security definer
stable
set search_path = ''
as $$
  select cc.card_id, cc.status, cc.requested_at, cc.decided_at,
         pc.duration_days, pc.weight_delta,
         mb.storage_path, ma.storage_path, c.business_name
  from public.card_consents cc
  join public.progress_cards pc on pc.id = cc.card_id
  join public.media mb on mb.id = pc.before_media_id
  join public.media ma on ma.id = pc.after_media_id
  join public.coaches c on c.id = cc.coach_id
  where cc.client_id = (select private.client_id())
    and cc.status <> 'withdrawn'
  order by cc.requested_at desc;
$$;

revoke execute on function public.my_card_consents() from public, anon;
grant execute on function public.my_card_consents() to authenticated;
