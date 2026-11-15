-- Platform training templates (coach_id IS NULL, client_id IS NULL), published.
-- Structure (exercises, sets x reps, rest, supersets) follows the workouts listed at
-- https://fitnessprogramer.com/workouts/ ; names and descriptions are original, with
-- Arabic in Modern Standard Arabic. source_url keeps the attribution.
-- Idempotent: upserts by slug; days/items are created only for a template that has none.
-- Skipped on purpose (a row could not be read unambiguously): 15-minute-hiit-workout-for-beginners, 200m-interval-running-workout-for-speed, 300-workout, back-workout-for-a-bigger-back, beginner-bodyweight-workout, slim-waist-workout-routine.

create function pg_temp.seed_item(d uuid, ord int, ex text, blk text, gk text, rest int, na text, ne text, s jsonb)
returns void language plpgsql as $f$
declare i uuid; lo int; hi int;
begin
  select coalesce(min((x->>0)::int), 0), coalesce(max(coalesce((x->>1)::int, (x->>0)::int)), 0)
    into lo, hi from jsonb_array_elements(s) x;
  insert into public.program_items (program_day_id, exercise_id, sets, reps, rest_seconds, order_index, block, group_key, group_kind, notes_ar, notes_en)
  values (d,
    (select e.id from public.exercises e where e.coach_id is null and e.archived_at is null and lower(e.name_en) = lower(ex)
       order by (e.name_en = ex) desc, e.created_at, e.id limit 1),
    jsonb_array_length(s), case when lo = hi then lo::text else lo || '-' || hi end, rest, ord, blk, gk,
    case when gk is null then null else 'superset' end, na, ne)
  returning id into i;
  insert into public.program_item_sets (program_item_id, set_index, reps, reps_max, duration_seconds, rest_seconds)
  select i, t.n::int, (t.x->>0)::int, (t.x->>1)::int, (t.x->>2)::int, rest
  from jsonb_array_elements(s) with ordinality as t(x, n);
end
$f$;

-- 10-best-bodyweight-exercises-to-get-rid-of-cellulite
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, '10-best-bodyweight-exercises-to-get-rid-of-cellulite', true, 'https://fitnessprogramer.com/workout/10-best-bodyweight-exercises-to-get-rid-of-cellulite/', 'حرق الجزء السفلي بوزن الجسم', 'Lower-Body Bodyweight Burn', 'عشرة تمارين بوزن الجسم للساقين والأرداف، من القرفصاء القفزي إلى الجلوس على الحائط. لا تحتاج إلى معدات.', 'Ten bodyweight moves for legs and glutes, from jump squats to wall sits. No equipment needed.',
    'beginner', 'fat_loss', array['at_home', 'body_weight', 'fat_burning', 'legs']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'High Knee Run', 'main', null, 30, null, null, '[[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 1, 'split squats', 'main', null, 30, null, null, '[[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Wall Sit', 'main', null, 30, null, null, '[[null,null,15],[null,null,15]]');
  perform pg_temp.seed_item(d, 3, 'Duck Walk', 'main', null, 30, null, null, '[[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Bodyweight Single Leg Deadlift', 'main', null, 30, null, null, '[[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 5, 'Standing Hip Abduction', 'main', null, 30, null, null, '[[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 6, 'Bridge Hip Abduction', 'main', null, 30, null, null, '[[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 7, 'Fire Hydrant', 'main', null, 30, null, null, '[[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 8, 'Plank Leg Lift', 'main', null, 30, null, null, '[[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 9, 'Bodyweight Sumo Squat', 'main', null, 30, null, null, '[[12,null,null],[12,null,null]]');
  end if;
end $$;

-- 300-calorie-hiit-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, '300-calorie-hiit-workout', true, 'https://fitnessprogramer.com/workout/300-calorie-hiit-workout/', 'حرق السعرات بالتمارين المتقطعة في المنزل', 'Home HIIT Calorie Burner', 'دائرة قصيرة عالية الكثافة من سبعة تمارين بوزن الجسم لرفع معدل ضربات القلب بسرعة.', 'A short, high-intensity circuit of seven bodyweight moves built to raise your heart rate fast.',
    'beginner', 'fat_loss', array['at_home', 'body_weight', 'fat_burning', 'full_body']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'High Knee Skips', 'main', null, 20, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 1, 'back and forth step', 'main', null, 20, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 2, 'mountain climber', 'main', null, 20, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 3, 'jump squat v. 2', 'main', null, 20, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 4, 'dead bug', 'main', null, 20, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 5, 'Bodyweight Sumo Squat', 'main', null, 20, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 6, 'burpee', 'main', null, 20, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  end if;
end $$;

-- 5-min-total-abs-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, '5-min-total-abs-workout', true, 'https://fitnessprogramer.com/workout/5-min-total-abs-workout/', 'تمرين البطن السريع في خمس دقائق', '5-Minute Abs Express', 'خمسة تمارين سريعة لعضلات الجذع لجلسة بطن مختصرة في المنزل دون معدات.', 'Five quick core exercises for a fast abs session at home, with no equipment.',
    'beginner', 'fat_loss', array['at_home', 'body_weight', 'core', 'fat_burning']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'flutter kicks', 'main', null, 10, null, null, '[[null,null,20],[null,null,20]]');
  perform pg_temp.seed_item(d, 1, 'mountain climber', 'main', null, 10, null, null, '[[null,null,20],[null,null,20]]');
  perform pg_temp.seed_item(d, 2, 'Crunches', 'main', null, 10, null, null, '[[null,null,20],[null,null,20]]');
  perform pg_temp.seed_item(d, 3, 'Bicycle Crunch', 'main', null, 10, null, null, '[[null,null,20],[null,null,20]]');
  perform pg_temp.seed_item(d, 4, 'Heel Touch', 'main', null, 10, null, null, '[[null,null,20],[null,null,20]]');
  end if;
end $$;

-- 8-exercises-for-bigger-breasts
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, '8-exercises-for-bigger-breasts', true, 'https://fitnessprogramer.com/workout/8-exercises-for-bigger-breasts/', 'بناء الصدر للمبتدئين', 'Chest Builder for Beginners', 'ثمانية تمارين للصدر تجمع بين الضغط وتمارين الدمبل، وتبدأ بإطالة ديناميكية.', 'Eight chest exercises that mix push-ups and dumbbell work, starting with a dynamic stretch.',
    'beginner', 'muscle', array['chest']::text[], '{}'::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'dynamic chest stretch (male)', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 1, 'push-up', 'main', null, 45, null, null, '[[8,null,null],[8,null,null],[8,null,null]]');
  perform pg_temp.seed_item(d, 2, 'dumbbell bench press', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Kneeling Diamond Push-Up', 'main', null, 45, null, null, '[[8,null,null],[8,null,null],[8,null,null]]');
  perform pg_temp.seed_item(d, 4, 'dumbbell fly', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 5, 'dumbbell pullover', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 6, 'Above Head Chest Stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10],[null,null,10]]');
  perform pg_temp.seed_item(d, 7, 'back pec stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10],[null,null,10]]');
  end if;
end $$;

-- at-home-back-fat-burning-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'at-home-back-fat-burning-workout', true, 'https://fitnessprogramer.com/workout/at-home-back-fat-burning-workout/', 'شد الظهر في المنزل', 'Home Back Toning', 'روتين بوزن الجسم يسخّن الكتفين ويعمل على عضلات الظهر العلوية والسفلية.', 'A bodyweight routine that warms up the shoulders and works the upper and lower back.',
    'beginner', 'muscle', array['at_home', 'back']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Arm Circles', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Wall Slides', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Arm Leg Raises', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Superman', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Cat-Cow', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 5, 'Side Plank', 'main', null, 45, null, null, '[[null,null,15],[null,null,15],[null,null,15]]');
  perform pg_temp.seed_item(d, 6, 'dead bug', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  end if;
end $$;

-- at-home-full-body-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'at-home-full-body-workout', true, 'https://fitnessprogramer.com/workout/at-home-full-body-workout/', 'تمرين الجسم الكامل دون معدات', 'No-Equipment Full Body', 'عشرة تمارين بوزن الجسم تشمل الصدر والظهر والساقين والجذع، في جلسة متوازنة يمكن أداؤها في أي مكان.', 'Ten bodyweight exercises covering chest, back, legs and core. A balanced session you can do anywhere.',
    'beginner', 'strength', array['at_home', 'full_body', 'strength']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Arm Circles', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Wall Slides', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 2, 'push-up', 'main', null, 60, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Bodyweight Sumo Squat', 'main', null, 45, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Plank Leg Lift', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 5, 'mountain climber', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 6, 'Superman', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 7, 'dead bug', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 8, 'triceps dips floor', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 9, 'biceps leg concentration curl', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  end if;
end $$;

-- back-workout-for-beginners
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'back-workout-for-beginners', true, 'https://fitnessprogramer.com/workout/back-workout-for-beginners/', 'أساسيات الظهر للمبتدئين', 'Beginner Back Basics', 'ستة تمارين للظهر على الأجهزة والكابل مع إحماء قصير، وهي طريقة آمنة لتعلّم حركات السحب.', 'Six machine and cable back exercises with a short warm-up, a safe way to learn pulling movements.',
    'beginner', 'strength', array['back', 'strength']::text[], array['cable', 'machine', 'band']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Arm Circles', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Lat Pulldown', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 2, 'lever t bar row', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Dumbbell Row', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Cable Rear Delt Fly', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 5, 'cable straight arm pulldown', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  end if;
end $$;

-- barbell-free-weights-workout-program
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'barbell-free-weights-workout-program', true, 'https://fitnessprogramer.com/workout/barbell-free-weights-workout-program/', 'بداية الجسم الكامل بالبار', 'Barbell Full Body Starter', 'سبع حركات بالبار للجسم كاملًا، من القرفصاء إلى الدحرجة. مصمم لثلاث جلسات أسبوعيًا.', 'Seven barbell lifts for the whole body, from squats to rollouts. Built for three sessions a week.',
    'beginner', 'strength', array['full_body', 'strength']::text[], array['barbell']::text[], 3)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Barbell Squat', 'main', null, 60, 'استخدم نحو 50–70٪ من أقصى وزن لديك.', 'Use about 50–70% of your maximum weight.', '[[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 1, 'barbell bench press', 'main', null, 45, 'استخدم نحو 50–70٪ من أقصى وزن لديك.', 'Use about 50–70% of your maximum weight.', '[[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 2, 'barbell bent over row', 'main', null, 45, 'استخدم نحو 50–70٪ من أقصى وزن لديك.', 'Use about 50–70% of your maximum weight.', '[[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 3, 'barbell romanian deadlift', 'main', null, 45, 'استخدم نحو 50–70٪ من أقصى وزن لديك.', 'Use about 50–70% of your maximum weight.', '[[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 4, 'barbell lying triceps extension', 'main', null, 45, 'استخدم نحو 50–70٪ من أقصى وزن لديك.', 'Use about 50–70% of your maximum weight.', '[[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 5, 'barbell curl', 'main', null, 45, 'استخدم نحو 50–70٪ من أقصى وزن لديك.', 'Use about 50–70% of your maximum weight.', '[[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 6, 'Barbell Rollout', 'main', null, 45, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  end if;
end $$;

-- beach-body-workout-routine
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'beach-body-workout-routine', true, 'https://fitnessprogramer.com/workout/beach-body-workout-routine/', 'نحت الجسم في المنزل', 'Home Body Sculpt', 'أحد عشر تمرينًا بوزن الجسم لجلسة شاملة في المنزل، تسبقها حركات إحماء للمرونة.', 'Eleven bodyweight exercises for a full-body session at home, with a mobility warm-up first.',
    'beginner', 'general', array['at_home', 'full_body']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Arm Circles', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Wall Slides', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 2, 'push-up', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Bodyweight Sumo Squat', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 4, 'High Knee Skips', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 5, 'dead bug', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 6, 'mountain climber', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 7, 'Superman', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 8, 'Arm Leg Raises', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 9, 'Plank Leg Lift', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 10, 'Glute Bridge', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  end if;
end $$;

-- beginner-leg-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'beginner-leg-workout', true, 'https://fitnessprogramer.com/workout/beginner-leg-workout/', 'يوم الساقين للمبتدئين', 'Beginner Leg Day', 'جلسة ساقين للمبتدئين تجمع بين تمارين وزن الجسم والأجهزة، مع إحماء ضمن البرنامج.', 'A beginner leg session mixing bodyweight moves and machines, with a warm-up built in.',
    'beginner', 'muscle', array['legs']::text[], array['machine']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'High Knee Run', 'warmup', null, 30, null, null, '[[10,15,null],[10,15,null]]');
  perform pg_temp.seed_item(d, 1, 'Cossack Squat', 'warmup', null, 30, null, null, '[[10,15,null],[10,15,null]]');
  perform pg_temp.seed_item(d, 2, 'Hack Squat Machine', 'main', null, 45, null, null, '[[8,10,null],[8,10,null],[8,10,null]]');
  perform pg_temp.seed_item(d, 3, 'Leg Curl', 'main', null, 45, null, null, '[[8,10,null],[8,10,null],[8,10,null]]');
  perform pg_temp.seed_item(d, 4, 'leg extension', 'main', null, 45, null, null, '[[8,10,null],[8,10,null],[8,10,null]]');
  perform pg_temp.seed_item(d, 5, 'Hip Abduction Machine', 'main', null, 45, null, null, '[[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 6, 'Hip Adduction Machine', 'main', null, 45, null, null, '[[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 7, 'Hack Squat Calf Raise', 'main', null, 45, null, null, '[[10,12,null],[10,12,null],[10,12,null]]');
  end if;
end $$;

-- biceps-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'biceps-workout', true, 'https://fitnessprogramer.com/workout/biceps-workout/', 'أساسيات عضلة البايسبس', 'Biceps Basics', 'أربعة أشكال من تجعيد الذراع بالبار والدمبل لبناء الجزء الأمامي من الذراع.', 'Four curl variations with a barbell and dumbbells to build the front of the arm.',
    'beginner', 'muscle', array['arms']::text[], array['barbell']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Z-Bar Curl', 'main', null, 60, null, null, '[[8,10,null],[8,10,null],[8,10,null]]');
  perform pg_temp.seed_item(d, 1, 'Seated Incline Dumbbell Curl', 'main', null, 60, null, null, '[[8,10,null],[8,10,null],[8,10,null]]');
  perform pg_temp.seed_item(d, 2, 'dumbbell preacher curl', 'main', null, 60, null, null, '[[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 3, 'dumbbell hammer curl', 'main', null, 60, null, null, '[[10,12,null],[10,12,null],[10,12,null]]');
  end if;
end $$;

-- bodyweight-strength-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'bodyweight-strength-workout', true, 'https://fitnessprogramer.com/workout/bodyweight-strength-workout/', 'القوة بوزن الجسم', 'Bodyweight Strength', 'خمسة تمارين مركبة بوزن الجسم، من العقلة إلى الضغط، للمتدربين المتوسطين.', 'Five compound bodyweight exercises, from pull-ups to push-ups, for intermediate lifters.',
    'intermediate', 'general', array['body_weight', 'full_body']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'pull-up', 'main', null, 30, null, null, '[[8,null,null]]');
  perform pg_temp.seed_item(d, 1, 'push-up', 'main', null, 30, null, null, '[[20,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Bodyweight Sumo Squat', 'main', null, 30, null, null, '[[20,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Bodyweight Skull Crushers', 'main', null, 30, null, null, '[[8,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Seated Side Crunch', 'main', null, 30, null, null, '[[20,null,null]]');
  end if;
end $$;

-- chest-and-back-superset-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'chest-and-back-superset-workout', true, 'https://fitnessprogramer.com/workout/chest-and-back-superset-workout/', 'سوبر ست الصدر والظهر', 'Chest and Back Supersets', 'ثلاثة أزواج سوبر ست للصدر والظهر، يعقب كل زوج راحة. جلسة فعّالة وشاقة.', 'Three chest-and-back superset pairs, each followed by a rest. Efficient and demanding.',
    'intermediate', 'muscle', array['back', 'chest']::text[], array['barbell', 'cable', 'machine']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'barbell bench press', 'main', 'ss1', null, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 1, 'barbell bent over row', 'main', 'ss1', 60, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 2, 'barbell incline bench press', 'main', 'ss2', null, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Lat Pulldown', 'main', 'ss2', 60, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Pec Deck Fly (Machine Fly)', 'main', 'ss3', null, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 5, 'Rear Delt Fly Machine', 'main', 'ss3', 60, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  end if;
end $$;

-- chest-workout-beginner
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'chest-workout-beginner', true, 'https://fitnessprogramer.com/workout/chest-workout-beginner/', 'يوم الصدر للمبتدئين', 'Beginner Chest Day', 'خمسة تمارين للصدر بالبار والدمبل والكابل، تغطي الضغط المسطح والمائل وتمارين الفلاي.', 'Five chest exercises with a barbell, dumbbells and cables, covering flat, incline and fly movements.',
    'beginner', 'muscle', array['chest']::text[], array['barbell', 'cable']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'barbell bench press', 'main', null, 45, null, null, '[[8,null,null],[8,null,null],[8,null,null],[8,null,null]]');
  perform pg_temp.seed_item(d, 1, 'dumbbell fly', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Incline Dumbbell Press', 'main', null, 45, null, null, '[[8,null,null],[8,null,null],[8,null,null],[8,null,null]]');
  perform pg_temp.seed_item(d, 3, 'High Cable Crossover', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 4, 'dumbbell pullover', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  end if;
end $$;

-- complete-abs-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'complete-abs-workout', true, 'https://fitnessprogramer.com/workout/complete-abs-workout/', 'دائرة البطن المتقدمة', 'Advanced Abs Circuit', 'خمسة تمارين شاقة للجذع تستهدف البطن العلوي والسفلي وعضلات الخاصرة.', 'Five demanding core exercises that hit the upper abs, lower abs and obliques.',
    'advanced', 'muscle', array['core']::text[], '{}'::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Bicycle Crunch', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Lying Scissor Kick', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Leg Raise', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 3, 'oblique crunches floor', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Spider Plank', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  end if;
end $$;

-- core-build-up-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'core-build-up-workout', true, 'https://fitnessprogramer.com/workout/core-build-up-workout/', 'بناء عضلات الجذع', 'Core Build-Up', 'عشرة تمارين لعضلات الجذع بوزن الجسم، تبدأ بإحماء وتتدرج إلى تمارين البلانك.', 'Ten bodyweight core exercises that start with a warm-up and progress to planks.',
    'beginner', 'muscle', array['body_weight', 'core']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Bodyweight Windmill', 'warmup', null, 30, null, null, '[[10,15,null],[10,15,null]]');
  perform pg_temp.seed_item(d, 1, 'Elbow To Knee Twists', 'warmup', null, 30, null, null, '[[10,15,null],[10,15,null]]');
  perform pg_temp.seed_item(d, 2, 'dead bug', 'main', null, 30, null, null, '[[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 3, 'Spider Plank', 'main', null, 30, null, null, '[[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 4, 'Leg Raise', 'main', null, 30, null, null, '[[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 5, 'Arm Leg Raises', 'main', null, 30, null, null, '[[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 6, 'Hindu Push-ups', 'main', null, 30, null, null, '[[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 7, 'Plank Leg Lift', 'main', null, 30, null, null, '[[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 8, 'Glute Bridge', 'main', null, 30, null, null, '[[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 9, 'Bicycle Crunch', 'main', null, 30, null, null, '[[10,12,null],[10,12,null]]');
  end if;
end $$;

-- flabby-arm-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'flabby-arm-workout', true, 'https://fitnessprogramer.com/workout/flabby-arm-workout/', 'روتين شد الذراعين', 'Arm Toning Routine', 'ستة تمارين للذراعين تعمل على البايسبس والترايسبس، من الضغط على الحائط إلى تجعيد الدمبل وركلات الترايسبس.', 'Six arm exercises for biceps and triceps, from wall push-ups to dumbbell curls and kickbacks.',
    'advanced', 'muscle', array['arms']::text[], '{}'::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Arm Circles', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 1, 'push-up (wall) v. 2', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Dumbbell Curl', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 3, 'dumbbell kickback', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Bench Dips', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 5, 'One-Arm Lying Triceps Extension', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  end if;
end $$;

-- full-body-workout-routine-for-beginners
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'full-body-workout-routine-for-beginners', true, 'https://fitnessprogramer.com/workout/full-body-workout-routine-for-beginners/', 'روتين الجسم الكامل للمبتدئين في النادي', 'Beginner Full Body Gym Routine', 'أحد عشر تمرينًا في النادي للصدر والظهر والساقين والذراعين، وهو برنامج أول متكامل للجسم كاملًا.', 'Eleven gym exercises across chest, back, legs and arms. A solid first full-body program.',
    'beginner', 'general', array['full_body']::text[], array['barbell', 'cable', 'machine']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'barbell bench press', 'main', null, 45, null, null, '[[8,10,null],[8,10,null],[8,10,null]]');
  perform pg_temp.seed_item(d, 1, 'dumbbell incline fly', 'main', null, 45, null, null, '[[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 2, 'barbell bent over row', 'main', null, 45, null, null, '[[8,10,null],[8,10,null],[8,10,null]]');
  perform pg_temp.seed_item(d, 3, 'Lat Pulldown', 'main', null, 45, null, null, '[[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 4, 'Smith Machine Shoulder Press', 'main', null, 45, null, null, '[[8,10,null],[8,10,null],[8,10,null]]');
  perform pg_temp.seed_item(d, 5, 'dumbbell lateral raise', 'main', null, 45, null, null, '[[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 6, 'Barbell Squat', 'main', null, 45, null, null, '[[8,10,null],[8,10,null],[8,10,null]]');
  perform pg_temp.seed_item(d, 7, 'Leg Curl', 'main', null, 45, null, null, '[[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 8, 'Seated Incline Dumbbell Curl', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 9, 'Bent Over Kickback', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 10, 'Bicycle Crunch', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  end if;
end $$;

-- inner-chest-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'inner-chest-workout', true, 'https://fitnessprogramer.com/workout/inner-chest-workout/', 'التركيز على الصدر الداخلي', 'Inner Chest Focus', 'خمسة تمارين تركّز على ضم الصدر للداخل بالضغط الألماسي والضغط بقبضة ضيقة والكابل.', 'Five exercises that squeeze the chest inward, using diamond push-ups, close-grip presses and cables.',
    'intermediate', 'muscle', array['chest']::text[], array['barbell', 'cable', 'machine']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'diamond push-up', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 1, 'barbell close-grip bench press', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 2, 'High Cable Crossover', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Hammer Press', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Pec Deck Fly (Machine Fly)', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  end if;
end $$;

-- leg-workout-for-building-muscle
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'leg-workout-for-building-muscle', true, 'https://fitnessprogramer.com/workout/leg-workout-for-building-muscle/', 'بناء عضلات الساقين', 'Leg Muscle Builder', 'تسعة تمارين للساقين بالبار والدمبل والأجهزة، تبدأ بإحماء على جهاز المشي.', 'Nine leg exercises with barbells, dumbbells and machines, starting with a treadmill warm-up.',
    'intermediate', 'muscle', array['legs']::text[], array['machine', 'barbell']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Treadmill Run', 'warmup', null, 45, null, null, '[[null,null,480]]');
  perform pg_temp.seed_item(d, 1, 'Barbell Squat', 'main', null, 60, null, null, '[[10,12,null],[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 2, 'barbell sumo deadlift', 'main', null, 60, null, null, '[[10,12,null],[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 3, 'Dumbbell Bulgarian Split Squat', 'main', null, 60, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Leg Curl', 'main', null, 60, null, null, '[[10,12,null],[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 5, 'Hack Squat Calf Raise', 'main', null, 60, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 6, 'Half Kneeling Hip Flexor Stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10]]');
  perform pg_temp.seed_item(d, 7, 'Standing Quadriceps Stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10]]');
  perform pg_temp.seed_item(d, 8, 'Inner Thigh Side Stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10]]');
  end if;
end $$;

-- neck-strengthening-exercises
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'neck-strengthening-exercises', true, 'https://fitnessprogramer.com/workout/neck-strengthening-exercises/', 'قوة ومرونة الرقبة', 'Neck Strength and Mobility', 'عشرة تمارين للرقبة، من الإطالات البسيطة إلى التمارين بحزام الأوزان، لبناء المرونة والقوة.', 'Ten neck exercises, from simple stretches to weighted harness work, to build mobility and strength.',
    'beginner', 'strength', array['strength']::text[], '{}'::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Neck Rotation Stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10]]');
  perform pg_temp.seed_item(d, 1, 'Neck Flexion Stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10]]');
  perform pg_temp.seed_item(d, 2, 'Neck Extension Stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10]]');
  perform pg_temp.seed_item(d, 3, 'neck side stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10]]');
  perform pg_temp.seed_item(d, 4, 'Front and Back Neck Stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10]]');
  perform pg_temp.seed_item(d, 5, 'Chin Tuck', 'main', null, 30, null, null, '[[12,15,null],[12,15,null]]');
  perform pg_temp.seed_item(d, 6, 'Sphinx Stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10]]');
  perform pg_temp.seed_item(d, 7, 'Lying Weighted Neck Extension', 'main', null, 45, null, null, '[[8,null,null],[8,null,null],[8,null,null]]');
  perform pg_temp.seed_item(d, 8, 'Weighted Lying Neck Flexion (Neck Harness)', 'main', null, 45, null, null, '[[8,null,null],[8,null,null],[8,null,null]]');
  perform pg_temp.seed_item(d, 9, 'dumbbell shrug', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  end if;
end $$;

-- no-equipment-lower-body-strength-exercises
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'no-equipment-lower-body-strength-exercises', true, 'https://fitnessprogramer.com/workout/no-equipment-lower-body-strength-exercises/', 'قوة الجزء السفلي دون معدات', 'Lower-Body Strength Without Equipment', 'ثمانية تمارين بوزن الجسم للساقين والأرداف، من الاندفاع إلى الجلوس على الحائط.', 'Eight bodyweight exercises for the legs and glutes, from lunges to wall sits.',
    'beginner', 'muscle', array['at_home', 'glutes', 'legs']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Side Lunge', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Bodyweight Sumo Squat', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Wall Sit', 'main', null, 30, null, null, '[[null,null,15],[null,null,15],[null,null,15]]');
  perform pg_temp.seed_item(d, 3, 'Side Lying Clam', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Single Leg Bridge', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 5, 'Bodyweight Standing Calf Raise', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 6, 'Thigh Fly (Adductor Magnus Stretch)', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 7, 'Fire Hydrant', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  end if;
end $$;

-- obliques-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'obliques-workout', true, 'https://fitnessprogramer.com/workout/obliques-workout/', 'عضلات الخاصرة في المنزل', 'Obliques at Home', 'ستة تمارين بوزن الجسم تستهدف جانبي الخصر دون الحاجة إلى معدات.', 'Six bodyweight exercises that target the sides of the waist, no equipment required.',
    'beginner', 'muscle', array['at_home', 'core']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Heel Touch', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 1, 'russian twist', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Plank Knee to Elbow', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Bicycle Crunch', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Half Wipers', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 5, 'Side Plank Leg Raises', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  end if;
end $$;

-- pyramid-chest-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'pyramid-chest-workout', true, 'https://fitnessprogramer.com/workout/pyramid-chest-workout/', 'روتين الصدر التصاعدي', 'Pyramid Chest Routine', 'ستة تمارين للصدر بنظام المجموعات التصاعدية، يزداد فيها الحمل مع انخفاض التكرارات.', 'Six chest exercises using pyramid sets, with the load rising as the reps drop.',
    'intermediate', 'muscle', array['chest']::text[], array['barbell', 'machine', 'cable']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'barbell bench press', 'main', null, 45, null, null, '[[12,null,null],[10,null,null],[8,null,null],[6,null,null],[4,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Incline Dumbbell Press', 'main', null, 45, null, null, '[[10,null,null],[8,null,null],[6,null,null],[4,null,null]]');
  perform pg_temp.seed_item(d, 2, 'dumbbell incline fly', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 3, 'chest dip', 'main', null, 45, null, null, '[[8,10,null],[8,10,null],[8,10,null]]');
  perform pg_temp.seed_item(d, 4, 'Cable Crossover', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 5, 'dumbbell pullover', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  end if;
end $$;

-- rounder-butt-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'rounder-butt-workout', true, 'https://fitnessprogramer.com/workout/rounder-butt-workout/', 'تشكيل الأرداف في المنزل', 'Glute Shaping at Home', 'ستة تمارين بوزن الجسم تركّز على الأرداف، منها ركلات الحمار والقرفصاء سومو.', 'Six bodyweight exercises focused on the glutes, including donkey kicks and sumo squats.',
    'beginner', 'muscle', array['at_home', 'glutes']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Donkey Kicks', 'main', null, 45, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Plank Leg Lift', 'main', null, 45, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Bodyweight Sumo Squat', 'main', null, 45, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Wall Sit', 'main', null, 45, null, null, '[[null,null,20],[null,null,20],[null,null,20]]');
  perform pg_temp.seed_item(d, 4, 'Glute Bridge', 'main', null, 45, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 5, 'Side Lying Clam', 'main', null, 45, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  end if;
end $$;

-- sexy-butt-and-abs-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'sexy-butt-and-abs-workout', true, 'https://fitnessprogramer.com/workout/sexy-butt-and-abs-workout/', 'الأرداف والبطن بوزن الجسم', 'Glutes and Abs Bodyweight', 'عشرة تمارين بوزن الجسم تجمع بين تمارين الأرداف وعضلات الجذع، تؤدى على الأرض أو وقوفًا.', 'Ten bodyweight exercises pairing glute work with core work, all done on the floor or standing.',
    'beginner', 'muscle', array['body_weight', 'core', 'glutes']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Bodyweight Sumo Squat', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Glute Bridge', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Side Lying Clam', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Donkey Kicks', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Plank Leg Lift', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 5, 'Fire Hydrant', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 6, 'Bridge Hip Abduction', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 7, 'Seated Side Crunch', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 8, 'Leg Raise', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  perform pg_temp.seed_item(d, 9, 'Bicycle Crunch', 'main', null, 30, null, null, '[[15,null,null],[15,null,null],[15,null,null]]');
  end if;
end $$;

-- shoulder-workout-for-beginners
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'shoulder-workout-for-beginners', true, 'https://fitnessprogramer.com/workout/shoulder-workout-for-beginners/', 'يوم الكتفين للمبتدئين', 'Beginner Shoulder Day', 'ثمانية تمارين للكتفين بالكابل والأجهزة والدمبل، تبدأ بتنشيط عضلات الكفة المدورة.', 'Eight shoulder exercises with cables, machines and dumbbells, starting with rotator cuff activation.',
    'beginner', 'muscle', array['shoulders']::text[], array['cable', 'machine']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Arm Circles', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Cable Internal Shoulder Rotation', 'main', null, 30, null, null, '[[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Cable External Shoulder Rotation', 'main', null, 30, null, null, '[[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 3, 'dumbbell lateral raise', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Smith Machine Shoulder Press', 'main', null, 45, null, null, '[[8,null,null],[8,null,null],[8,null,null],[8,null,null]]');
  perform pg_temp.seed_item(d, 5, 'Dumbbell Shoulder Press', 'main', null, 45, null, null, '[[8,null,null],[8,null,null],[8,null,null],[8,null,null]]');
  perform pg_temp.seed_item(d, 6, 'Bent Over Lateral Raise', 'main', null, 45, null, null, '[[8,null,null],[8,null,null],[8,null,null],[8,null,null]]');
  perform pg_temp.seed_item(d, 7, 'dumbbell shrug', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  end if;
end $$;

-- shoulder-workout-intermediate-level
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'shoulder-workout-intermediate-level', true, 'https://fitnessprogramer.com/workout/shoulder-workout-intermediate-level/', 'يوم الكتفين للمتوسطين', 'Intermediate Shoulder Day', 'سبعة تمارين للكتفين تجمع بين الرفعات والضغط بالبار وتمرين الكتف الخلفي ورفع الأكتاف.', 'Seven shoulder exercises combining raises, a barbell press, rear-delt work and shrugs.',
    'intermediate', 'muscle', array['shoulders']::text[], array['barbell', 'machine']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Arm Circles', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 1, 'dumbbell lateral raise', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Seated Barbell Shoulder Press', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 3, 'dumbbell front raise', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 4, '45 Degree Incline Dumbbell Row', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 5, 'Rear Delt Fly Machine', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 6, 'dumbbell shrug', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  end if;
end $$;

-- summer-body-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'summer-body-workout', true, 'https://fitnessprogramer.com/workout/summer-body-workout/', 'كارديو خفيف وجذع في المنزل', 'Light Cardio and Core at Home', 'سبع حركات بوزن الجسم تجمع بين الكارديو الخفيف وتمارين الجذع لجلسة حرق دهون.', 'Seven bodyweight moves that mix light cardio and core work for a fat-burning session.',
    'beginner', 'fat_loss', array['at_home', 'fat_burning']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Arm Circles', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 1, 'back and forth step', 'main', null, 10, null, null, '[[10,12,null]]');
  perform pg_temp.seed_item(d, 2, 'dead bug', 'main', null, 10, null, null, '[[10,12,null]]');
  perform pg_temp.seed_item(d, 3, 'Step Up with Knee Raises', 'main', null, 10, null, null, '[[10,12,null]]');
  perform pg_temp.seed_item(d, 4, 'push-up', 'main', null, 10, null, null, '[[10,12,null]]');
  perform pg_temp.seed_item(d, 5, 'Bodyweight Sumo Squat', 'main', null, 10, null, null, '[[10,12,null]]');
  perform pg_temp.seed_item(d, 6, 'Glute Bridge', 'main', null, 10, null, null, '[[10,12,null]]');
  end if;
end $$;

-- the-best-12-posture-exercises
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'the-best-12-posture-exercises', true, 'https://fitnessprogramer.com/workout/the-best-12-posture-exercises/', 'تصحيح القوام', 'Posture Reset', 'اثنا عشر تمرينًا للمرونة والتقوية لأعلى الظهر والكتفين والجذع للمساعدة على تحسين القوام.', 'Twelve mobility and strengthening exercises for the upper back, shoulders and core to help posture.',
    'beginner', 'strength', array['at_home', 'back', 'core', 'strength']::text[], array['body weight']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Arm Circles', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Wall Slides', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Standing Rotation', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Cat-Cow', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Swimming', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 5, 'Side Plank', 'main', null, 30, null, null, '[[null,null,15],[null,null,15],[null,null,15]]');
  perform pg_temp.seed_item(d, 6, 'Arm Leg Raises', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 7, 'Reverse Plank Kicks', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 8, 'Seated Side Crunch', 'main', null, 30, null, null, '[[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 9, 'Sphinx Stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10],[null,null,10]]');
  perform pg_temp.seed_item(d, 10, 'upper back stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10],[null,null,10]]');
  perform pg_temp.seed_item(d, 11, 'Shoulder Stretch Behind The Back', 'main', null, 30, null, null, '[[null,null,10],[null,null,10],[null,null,10]]');
  end if;
end $$;

-- the-best-rotator-cuff-exercises
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'the-best-rotator-cuff-exercises', true, 'https://fitnessprogramer.com/workout/the-best-rotator-cuff-exercises/', 'العناية بالكفة المدورة', 'Rotator Cuff Care', 'تسعة تمارين خفيفة الحمل للكتف تقوّي الكفة المدورة وتحافظ على سلامة المفصل.', 'Nine low-load shoulder exercises that strengthen the rotator cuff and keep the joint healthy.',
    'beginner', 'muscle', array['shoulders']::text[], array['cable']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Arm Circles', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Wall Slides', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Cable Internal Shoulder Rotation', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Cable External Shoulder Rotation', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 4, 'Dumbbell Scaption', 'main', null, 45, null, null, '[[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 5, 'Seated Rear Lateral Dumbbell Raise', 'main', null, 30, null, null, '[[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 6, 'dumbbell scott press', 'main', null, 45, null, null, '[[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 7, 'Doorway Pec and Shoulder Stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10]]');
  perform pg_temp.seed_item(d, 8, 'Across Chest Shoulder Stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10]]');
  end if;
end $$;

-- the-complete-arm-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'the-complete-arm-workout', true, 'https://fitnessprogramer.com/workout/the-complete-arm-workout/', 'يوم الذراعين المتكامل', 'Complete Arm Day', 'ثمانية تمارين للبايسبس والترايسبس والساعدين، مع زوجين من السوبر ست.', 'Eight exercises for biceps, triceps and forearms, with two superset pairs.',
    'intermediate', 'muscle', array['arms']::text[], array['cable', 'barbell']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Seated Incline Dumbbell Curl', 'main', null, 60, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Bent Over Kickback', 'main', null, 60, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 2, 'cable one arm curl', 'main', 'ss1', null, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 3, 'One-Arm Reverse Pushdown', 'main', 'ss1', null, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 4, 'EZ Bar Preacher Curl', 'main', 'ss2', null, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 5, 'cable overhead triceps extension (rope attachment)', 'main', 'ss2', null, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 6, 'Dumbbell Wrist Curl', 'main', null, 60, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 7, 'Reverse Wrist Curl', 'main', null, 60, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  end if;
end $$;

-- triceps-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'triceps-workout', true, 'https://fitnessprogramer.com/workout/triceps-workout/', 'التركيز على الترايسبس', 'Triceps Focus', 'أربعة تمارين للترايسبس بالغطس والكابل والدمبل.', 'Four triceps exercises using dips, cables and dumbbells.',
    'beginner', 'muscle', array['arms']::text[], array['machine', 'cable']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'triceps dip', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Triceps Push-down', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 2, 'dumbbell kickback', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 3, 'One-Arm Reverse Pushdown', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  end if;
end $$;

-- ultimate-back-fat-burning-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'ultimate-back-fat-burning-workout', true, 'https://fitnessprogramer.com/workout/ultimate-back-fat-burning-workout/', 'الظهر وحرق الدهون للمتقدمين', 'Advanced Back and Fat Burn', 'سبعة تمارين للظهر مع إحماء للكتفين وتكرارات أعلى لجلسة متقدمة عالية الحجم.', 'Seven back exercises with a shoulder warm-up and higher rep ranges for an advanced, high-volume session.',
    'advanced', 'fat_loss', array['back', 'fat_burning']::text[], array['cable', 'machine']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Arm Circles', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 1, 'Wall Slides', 'main', null, 30, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Lat Pulldown', 'main', null, 45, null, null, '[[12,15,null],[12,15,null],[12,15,null],[12,15,null]]');
  perform pg_temp.seed_item(d, 3, 'dumbbell bent over row', 'main', null, 45, null, null, '[[10,12,null],[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 4, 'cable seated row', 'main', null, 45, null, null, '[[12,15,null],[12,15,null],[12,15,null],[12,15,null]]');
  perform pg_temp.seed_item(d, 5, 'Rear Delt Fly Machine', 'main', null, 45, null, null, '[[12,15,null],[12,15,null],[12,15,null],[12,15,null]]');
  perform pg_temp.seed_item(d, 6, 'hyperextension', 'main', null, 45, null, null, '[[15,null,null],[15,null,null],[15,null,null],[15,null,null]]');
  end if;
end $$;

-- ultimate-back-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'ultimate-back-workout', true, 'https://fitnessprogramer.com/workout/ultimate-back-workout/', 'يوم الظهر للمتقدمين', 'Advanced Back Day', 'تسعة تمارين للظهر، من العقلة إلى التجديف بالبار، لجلسة قوة متقدمة.', 'Nine back exercises, from pull-ups to barbell rows, for an advanced strength session.',
    'advanced', 'strength', array['back', 'strength']::text[], array['barbell', 'cable']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'Arm Circles', 'main', null, 30, null, null, '[[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 1, 'Wall Slides', 'main', null, 30, null, null, '[[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 2, 'pull-up', 'main', null, 60, null, null, '[[8,10,null],[8,10,null],[8,10,null]]');
  perform pg_temp.seed_item(d, 3, 'barbell bent over row', 'main', null, 60, null, null, '[[10,12,null],[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 4, 'cable seated row', 'main', null, 45, null, null, '[[10,12,null],[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 5, 'Rope Straight Arm Pulldown', 'main', null, 45, null, null, '[[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 6, 'Face Pull', 'main', null, 45, null, null, '[[10,12,null],[10,12,null],[10,12,null]]');
  perform pg_temp.seed_item(d, 7, 'back pec stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10],[null,null,10]]');
  perform pg_temp.seed_item(d, 8, 'Standing Reach-Up Back Rotation Stretch', 'main', null, 30, null, null, '[[null,null,10],[null,null,10],[null,null,10]]');
  end if;
end $$;

-- upper-chest-workout
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, 'upper-chest-workout', true, 'https://fitnessprogramer.com/workout/upper-chest-workout/', 'التركيز على الصدر العلوي', 'Upper Chest Focus', 'خمسة تمارين على المستوى المائل تُحمّل الصدر العلوي، بالبار والدمبل والجهاز والكابل.', 'Five incline-based exercises that load the upper chest, with barbell, dumbbell, machine and cable work.',
    'intermediate', 'muscle', array['chest']::text[], array['barbell', 'machine', 'cable']::text[], null)
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
  perform pg_temp.seed_item(d, 0, 'barbell incline bench press', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 1, 'dumbbell incline fly', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 2, 'Incline Chest Press Machine', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  perform pg_temp.seed_item(d, 3, 'Low Cable Crossover', 'main', null, 45, null, null, '[[12,null,null],[12,null,null],[12,null,null],[12,null,null]]');
  perform pg_temp.seed_item(d, 4, 'dumbbell pullover', 'main', null, 45, null, null, '[[10,null,null],[10,null,null],[10,null,null],[10,null,null]]');
  end if;
end $$;
