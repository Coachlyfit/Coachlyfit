-- subscription_tiers has existed since 20260731000010_billing.sql but was
-- never seeded, leaving the marketing pricing section blank in production.
-- Seeds the three tiers from `Coachlyfit Site.dc.html` (Claude Design
-- project 3f41459e-1ea9-4db8-8055-11b746bbf61d). Prices/caps are the design's
-- placeholder figures — swap for real numbers before launch if these were
-- never finalized.
--
-- `features` only carries the four flags pricing-section.tsx's FEATURE_ORDER
-- knows how to render (forms_builder, custom_library, priority_support,
-- white_label); the design's plainer bullets ("فواتير يدوية", "دعم بالإيميل",
-- etc.) have no flag to hang off and are left implicit as baseline, ungated
-- functionality.
insert into public.subscription_tiers (key, name_ar, name_en, price_egp_monthly, max_clients, features, is_active)
values
  ('starter', 'مبتدئ', 'Starter', 299, 10, '{}'::jsonb, true),
  ('pro', 'محترف', 'Pro', 599, 50, '{"forms_builder": true, "priority_support": true, "white_label": true}'::jsonb, true),
  ('elite', 'استوديو', 'Studio', 1299, 999999, '{"forms_builder": true, "custom_library": true, "priority_support": true, "white_label": true}'::jsonb, true);
