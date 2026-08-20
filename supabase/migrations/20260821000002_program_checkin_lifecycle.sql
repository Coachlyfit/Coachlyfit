-- Plan lifecycle: when a program's end_date passes, auto-assign the coach's
-- designated check-in form to the client — closes the loop that otherwise
-- depends on the coach remembering to send one. Mirrors the billing cron's
-- pattern (domain/billing/lifecycle.ts's nextStatus / this feature's
-- domain/programs/lifecycle.ts's shouldTriggerCheckin), extended into the
-- same daily route rather than a second cron.

-- Idempotency marker: once set, shouldTriggerCheckin never fires again for
-- this program, same role as checkins.reviewed_at / coach_seen_at elsewhere.
alter table public.programs
  add column checkin_triggered_at timestamptz;

-- Per-coach setting: which check-in template to auto-send. Nullable — a
-- coach who hasn't configured one simply doesn't get the auto-send behavior,
-- not an error state. `on delete set null` so deleting the template doesn't
-- take the coach row down with it.
alter table public.coaches
  add column default_checkin_template_id uuid references public.form_templates (id) on delete set null;
