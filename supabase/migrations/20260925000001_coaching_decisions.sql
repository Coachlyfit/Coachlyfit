-- The Coaching Ledger: one visible record per coaching decision, linking
-- the review the coach made (checkins.decision/adjustments, already there)
-- to the program revision it produced and, later, to whether it worked.
-- Signals (pain repeated on an exercise, missed reps, a repeated note) are
-- NOT stored anywhere -- they're derived from workout_set_logs/
-- workout_exercise_results/checkins on read (src/domain/ledger/signals.ts),
-- same "compute from history" approach as prs.ts/stats.ts. What IS stored
-- here is the evidence snapshot the coach actually acted on, so a
-- decision's rationale stays accurate even as later logs change the live
-- signal picture.
create table public.coaching_decisions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- unique: one decision per check-in review (submitReviewAction creates
  -- exactly one), so a re-submitted review can't silently fork the ledger.
  checkin_id uuid unique references public.checkins (id) on delete set null,
  program_id uuid references public.programs (id) on delete set null,

  decision text not null check (decision in ('keep', 'adjust', 'call')),
  reason_key text not null check (
    reason_key in (
      'protect_joint', 'recover_fatigue', 'rebuild_consistency',
      'progress_ready', 'technique_focus', 'schedule_fit', 'other'
    )
  ),
  client_note text check (char_length(client_note) <= 280),
  adjustments jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  affected_item_ids uuid[] not null default '{}'::uuid[],

  applied_at timestamptz,
  revision_id uuid references public.program_revisions (id) on delete set null,

  outcome_status text not null default 'pending' check (
    outcome_status in ('pending', 'resolved', 'persisting', 'worse', 'not_evaluable')
  ),
  outcome_evidence jsonb,
  evaluated_at timestamptz,

  -- Plain auth.uid() (not the "(select ...)" RLS-inlining idiom used in
  -- policies below -- see 20260731000004_private_helpers.sql's comment on
  -- that being an RLS-only performance trick): a column DEFAULT evaluates
  -- once per inserted row, not once per row scanned by a policy, so there's
  -- no per-row auth.uid() re-evaluation cost to avoid here.
  decided_by uuid references public.profiles (id) on delete set null default auth.uid(),
  client_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index coaching_decisions_client_id_idx on public.coaching_decisions (client_id, created_at desc);
create index coaching_decisions_coach_id_idx on public.coaching_decisions (coach_id);
create index coaching_decisions_pending_idx on public.coaching_decisions (applied_at)
  where outcome_status = 'pending';

alter table public.coaching_decisions enable row level security;

-- Same shape as client_observations: the coach reads/writes their own
-- tenant's rows, the client can only read their own -- no client write
-- grant at all, same "coach owns the record" reasoning as checkins'
-- review_checkin RPC.
create policy coach_rw on public.coaching_decisions
  for all to authenticated
  using (coach_id = (select private.coach_id()))
  with check (coach_id = (select private.coach_id()));

create policy client_read_own on public.coaching_decisions
  for select to authenticated
  using (client_id = (select private.client_id()));

grant select, insert, update, delete on public.coaching_decisions to authenticated;
grant select, insert, update, delete on public.coaching_decisions to service_role;

-- Client-side read receipt for the "Coach Decision" card, same write-path
-- shape as mark_checkin_seen (20260809000003_checkin_seen.sql): the client
-- has no UPDATE grant that could let them edit anything else on the row,
-- so a narrow security-definer RPC is the only write path.
create function public.mark_decision_seen(p_decision_id uuid)
returns public.coaching_decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.coaching_decisions;
begin
  if (select private.client_id()) is null then
    raise exception 'Client only.' using errcode = '42501';
  end if;

  update public.coaching_decisions
  set client_seen_at = coalesce(client_seen_at, now())
  where id = p_decision_id
    and client_id = (select private.client_id())
  returning * into v_row;

  if not found then
    raise exception 'Decision not found.' using errcode = '22023';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.mark_decision_seen(uuid) from public;
grant execute on function public.mark_decision_seen(uuid) to authenticated;

-- Client-facing "coach decided something" notification, same trigger shape
-- as private.notify_on_message() (20260802000001_workout_sessions_and_
-- messages.sql): notifications has no INSERT grant for `authenticated`
-- (see 20260801000015_library_source.sql's comment on that), so a
-- security-definer trigger is how a coach's own insert (via coach_rw
-- above) ends up producing a notification the CLIENT can read.
create function private.notify_on_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_profile_id uuid;
begin
  select profile_id into v_client_profile_id
  from public.clients where id = new.client_id;

  if v_client_profile_id is not null then
    insert into public.notifications (profile_id, kind, payload)
    values (
      v_client_profile_id,
      'coach_decision',
      jsonb_build_object('decision_id', new.id, 'client_id', new.client_id)
    );
  end if;
  return new;
end;
$$;

create trigger coaching_decisions_notify_client
  after insert on public.coaching_decisions
  for each row execute function private.notify_on_decision();

-- Outcome-resolved notification, to BOTH sides — coaches.id === profiles.id
-- (see private.coach_id()'s join in 20260731000003_coaches.sql), so the
-- coach's own profile_id is new.coach_id directly; the client's needs the
-- same clients.profile_id lookup as notify_on_decision above.
create function private.notify_on_decision_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_profile_id uuid;
begin
  if old.outcome_status = 'pending' and new.outcome_status <> 'pending' then
    select profile_id into v_client_profile_id
    from public.clients where id = new.client_id;

    if v_client_profile_id is not null then
      insert into public.notifications (profile_id, kind, payload)
      values (
        v_client_profile_id,
        'decision_outcome',
        jsonb_build_object('decision_id', new.id, 'outcome_status', new.outcome_status)
      );
    end if;

    insert into public.notifications (profile_id, kind, payload)
    values (
      new.coach_id,
      'decision_outcome',
      jsonb_build_object('decision_id', new.id, 'client_id', new.client_id, 'outcome_status', new.outcome_status)
    );
  end if;
  return new;
end;
$$;

create trigger coaching_decisions_notify_outcome
  after update on public.coaching_decisions
  for each row execute function private.notify_on_decision_outcome();
