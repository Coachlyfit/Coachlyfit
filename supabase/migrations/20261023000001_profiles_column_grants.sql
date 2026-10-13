-- Privilege escalation: 20260731000002_profiles.sql granted UPDATE on the whole
-- table to authenticated and then ran `revoke update (role)`. A column-level
-- revoke does nothing while a table-level grant exists, so any signed-in user
-- could update their own `role` (become admin) or `suspended_at` (lift a
-- suspension) straight through PostgREST.
--
-- Table-level UPDATE is revoked and only the columns a user legitimately edits
-- are granted back. Everything else (role, suspended_at, last_seen_at, the
-- terms columns) is written by security definer functions and service_role,
-- which this does not affect.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, locale, avatar_url, email_notifications)
  on public.profiles to authenticated;
