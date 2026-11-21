-- Supabase Cron setup for the sub-daily jobs that the Vercel Hobby plan
-- rejects (Hobby allows only one run per day per cron job). Supabase Cron is
-- pg_cron + pg_net, is available on the Free plan, and calls the exact same
-- CRON_SECRET-protected endpoints, so no route code changes are needed.
--
-- Run this once per environment in the Supabase Dashboard -> SQL Editor.
--
-- 1) Store the base URL and the cron secret in Vault first. They are read at
--    request time, so the secret never appears in cron.job.command:
--
--      select vault.create_secret('https://coachlyfit.vercel.app', 'app_url');
--      select vault.create_secret('<same value as CRON_SECRET on Vercel>', 'cron_secret');
--
--    If a secret already exists, update it instead:
--
--      select vault.update_secret((select id from vault.secrets where name = 'app_url'), 'https://coachlyfit.vercel.app');
--      select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<secret>');
--
-- 2) Run the rest of this file.
--
-- 3) Verify:
--
--      select jobid, jobname, schedule, active from cron.job order by jobid;
--      select * from cron.job_run_details order by start_time desc limit 20;
--      select * from net._http_response order by created desc limit 20;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Delivery queue: emails + web push, every 5 minutes (was "*/5 * * * *").
-- The route can process a 50-row batch sequentially, so allow it the full
-- Vercel Hobby function budget instead of pg_net's 2s default.
select cron.schedule(
  'coachlyfit-notifications-every-5-min',
  '*/5 * * * *',
  $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/notifications',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 295000
  ) as request_id;
  $job$
);

-- Nutrition reminders: queues notifications for clients whose local reminder
-- time has arrived, every 15 minutes (was "*/15 * * * *"). Fast query, but
-- the default 2s is still tight for a cold-starting serverless function.
select cron.schedule(
  'coachlyfit-nutrition-reminders-every-15-min',
  '*/15 * * * *',
  $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/nutrition-reminders',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  ) as request_id;
  $job$
);

-- Unread-message nudge: emails a coach once when a client's message has gone
-- unanswered past the coach's chosen delay (30 min / 1 h / 2 h), every 15
-- minutes. The route claims each window with an UPDATE, so overlapping or
-- repeated runs never email twice.
select cron.schedule(
  'coachlyfit-message-nudges-every-15-min',
  '*/15 * * * *',
  $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/message-nudges',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  ) as request_id;
  $job$
);

-- Appointment reminders (24h and 1h before a confirmed session), every 15
-- minutes. The route claims each reminder with an UPDATE, so overlapping or
-- repeated runs never notify twice.
select cron.schedule(
  'coachlyfit-appointment-reminders-every-15-min',
  '*/15 * * * *',
  $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/appointment-reminders',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  ) as request_id;
  $job$
);

-- Public site result photos: removes storage copies queued after a client
-- withdraws consent, hourly (was "0 * * * *" in vercel.json, which Hobby rejects).
select cron.schedule(
  'coachlyfit-site-results-purge-hourly',
  '0 * * * *',
  $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/site-results-purge',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  ) as request_id;
  $job$
);

-- Google Calendar sync, every 3 minutes: pushes queued appointment changes to
-- each connected coach's "Coachly Fit" calendar, keeps their Google watch
-- channel alive, pulls changes they made in Google, and refreshes their Google
-- busy time (so booking slots avoid it). A Google webhook also triggers this
-- same route right away. Channel renewal also runs daily from vercel.json.
select cron.schedule(
  'coachlyfit-google-sync-every-3-min',
  '*/3 * * * *',
  $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/google-sync',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 120000
  ) as request_id;
  $job$
);
