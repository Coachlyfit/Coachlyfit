-- Supersets/circuits: items sharing a group_key are performed back-to-back
-- as one round before resting, rather than each doing all its own sets
-- first. group_key is a coach-chosen opaque string (not a FK to anything —
-- there's no separate "groups" table, the grouping IS the shared key,
-- same "derive state from a column, don't add a redundant table" pattern
-- as coach_id is null = global and client_id is null = template
-- elsewhere in this schema), unique per program_day so two different
-- days' groups never collide. group_kind is only meaningful when
-- group_key is set; null on an ungrouped item.
alter table public.program_items
  add column group_key text,
  add column group_kind text check (group_kind in ('superset', 'circuit'));

alter table public.program_items
  add constraint program_items_group_kind_requires_key
    check (group_kind is null or group_key is not null);

create index program_items_group_key_idx on public.program_items (program_day_id, group_key) where group_key is not null;
