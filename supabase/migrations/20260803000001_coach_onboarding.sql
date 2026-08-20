-- Tracks the coach-onboarding wizard: training_mode is collected in step 1,
-- onboarding_completed_at is stamped by completeOnboardingAction once the
-- coach finishes (or the wizard would never stop redirecting them back to
-- it — see the (coach) layout guard).
alter table public.coaches
  add column onboarding_completed_at timestamptz,
  add column training_mode text check (training_mode in ('online', 'hybrid', 'in_person'));
