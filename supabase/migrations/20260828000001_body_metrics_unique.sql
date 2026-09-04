-- One value per client per metric per day. Without this, a double-submit
-- (retry after a flaky connection, or a second tab) silently duplicates a
-- data point and skews every chart built on body_metrics — the same failure
-- mode checkins already closed via unique(client_id, checkin_date).
alter table public.body_metrics
  add constraint body_metrics_client_metric_date_key unique (client_id, metric, taken_on);
