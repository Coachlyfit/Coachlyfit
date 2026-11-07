-- Supabase Cron setup for the two sub-daily jobs that the Vercel Hobby plan
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
