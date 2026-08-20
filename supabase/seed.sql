-- Local/dev seed data: `supabase db reset` runs this after all migrations.
-- Pricing is illustrative for the Egyptian market — adjust in the admin
-- dashboard once live, not by re-seeding.

insert into public.subscription_tiers (key, name_ar, name_en, price_egp_monthly, max_clients, features) values
  ('starter', 'أساسي', 'Starter', 450,  15,  '{"forms_builder": true, "custom_library": true}'::jsonb),
  ('pro',     'احترافي', 'Pro',    900,  50,  '{"forms_builder": true, "custom_library": true, "priority_support": true}'::jsonb),
  ('elite',   'إيليت',   'Elite',  1800, 999999, '{"forms_builder": true, "custom_library": true, "priority_support": true, "white_label": true}'::jsonb);

-- Global exercise library (coach_id null = platform-curated).
insert into public.exercises (name_ar, name_en, muscle_group, equipment) values
  ('ضغط البنش', 'Barbell Bench Press', 'chest', 'barbell'),
  ('سكوات', 'Barbell Back Squat', 'legs', 'barbell'),
  ('رفعة ميتة', 'Deadlift', 'back', 'barbell'),
  ('سحب أمامي', 'Lat Pulldown', 'back', 'machine'),
  ('تجديف بالبار', 'Barbell Row', 'back', 'barbell'),
  ('ضغط كتف', 'Overhead Press', 'shoulders', 'barbell'),
  ('رفرفة جانبية', 'Lateral Raise', 'shoulders', 'dumbbell'),
  ('بايسبس بار', 'Barbell Curl', 'arms', 'barbell'),
  ('ترايسبس بوش داون', 'Triceps Pushdown', 'arms', 'cable'),
  ('عقلة', 'Pull-up', 'back', 'bodyweight'),
  ('ضغط', 'Push-up', 'chest', 'bodyweight'),
  ('برجر', 'Burpee', 'full_body', 'bodyweight'),
  ('بلانك', 'Plank', 'core', 'bodyweight'),
  ('لانجز', 'Walking Lunge', 'legs', 'dumbbell'),
  ('ليج بريس', 'Leg Press', 'legs', 'machine'),
  ('هيب ثرست', 'Hip Thrust', 'glutes', 'barbell'),
  ('جري', 'Running', 'cardio', 'none'),
  ('حبل قفز', 'Jump Rope', 'cardio', 'rope');

-- Global food library: MENA/Egyptian staples alongside standard gym-diet
-- items, macros per stated serving. category powers the kanban view.
insert into public.foods (name_ar, name_en, serving_label, kcal, protein_g, carb_g, fat_g, category) values
  ('فول مدمس', 'Ful Medames', '1 cup cooked (170g)', 190, 13, 33, 1.5, 'protein'),
  ('طعمية', 'Ta''meya (Falafel)', '4 pieces (100g)', 330, 13, 32, 18, 'protein'),
  ('كشري', 'Koshari', '1 plate (350g)', 520, 15, 95, 9, 'carbs'),
  ('عيش بلدي', 'Baladi Bread', '1 loaf (90g)', 240, 8, 48, 1.5, 'carbs'),
  ('ملوخية', 'Molokhia', '1 cup (240g)', 95, 5, 12, 3.5, 'vegetables'),
  ('محشي كرنب', 'Stuffed Cabbage (Mahshi)', '4 rolls (250g)', 310, 7, 45, 11, 'other'),
  ('رز معمر', 'Roz Mo''ammar', '1 cup (200g)', 260, 5, 45, 6, 'carbs'),
  ('بلح', 'Dates', '3 pieces (30g)', 80, 0.6, 21, 0.1, 'fruits'),
  ('لبنة', 'Labneh', '2 tbsp (30g)', 55, 2.5, 2, 4, 'dairy'),
  ('جبنة حلوم', 'Halloumi', '30g slice', 100, 7, 1, 7.5, 'dairy'),
  ('طحينة', 'Tahini', '1 tbsp (15g)', 89, 2.6, 3.2, 8, 'fats'),
  ('صدر فرخة مشوي', 'Grilled Chicken Breast', '150g', 248, 46, 0, 5.4, 'protein'),
  ('بيض مسلوق', 'Boiled Egg', '1 large (50g)', 78, 6.3, 0.6, 5.3, 'protein'),
  ('أرز أبيض', 'White Rice', '1 cup cooked (158g)', 205, 4.3, 45, 0.4, 'carbs'),
  ('شوفان', 'Oats', '1 cup dry (80g)', 300, 10.5, 54, 5.3, 'carbs'),
  ('زبادي يوناني', 'Greek Yogurt', '170g', 100, 17, 6, 0.7, 'dairy'),
  ('موز', 'Banana', '1 medium (118g)', 105, 1.3, 27, 0.4, 'fruits'),
  ('زيت زيتون', 'Olive Oil', '1 tbsp (14g)', 119, 0, 0, 14, 'fats'),
  ('سمك بلطي مشوي', 'Grilled Tilapia', '150g', 195, 40, 0, 3, 'protein'),
  ('عدس', 'Lentils', '1 cup cooked (198g)', 230, 18, 40, 0.8, 'protein');
