-- Offline session logging: a set logged with no signal is synced later, so the
-- row's server-side `completed_at` would be the sync time, not when the client
-- actually did the set. `client_logged_at` records the device clock at log time
-- (informational, untrusted); `completed_at` is derived from it server-side but
-- clamped to now() in WorkoutsService.logSet so a client can't forward-date a
-- row to dodge the 7-day edit lock (private.reject_stale_client_edit).
--
-- `id` already accepts a client-generated uuid (default gen_random_uuid() only
-- applies when omitted), and retries are idempotent through the existing
-- (session_id, program_item_id, set_index) unique key, so nothing else changes.
-- RLS is untouched: client_own (for all, client_id = private.client_id()) still
-- gates every read/insert/update/delete.

alter table public.workout_set_logs
  add column if not exists client_logged_at timestamptz;
